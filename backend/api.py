import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.agent.manus import Manus
from app.logger import logger

app = FastAPI(title="OpenManus Backend API")

# ✅ Allow frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    global agent
    agent = await Manus.create()
    logger.info("✅ Manus agent initialized.")

@app.on_event("shutdown")
async def shutdown_event():
    await agent.cleanup()
    logger.info("🧹 Manus agent cleaned up.")


class PromptRequest(BaseModel):
    prompt: str


@app.post("/api/run")
async def run_prompt(request: PromptRequest):
    await agent.run(request.prompt)
    return {"message": "Prompt processed successfully."}


from fastapi.responses import StreamingResponse

@app.get("/stream")
async def stream_prompt(prompt: str):
    """
    SSE (Server-Sent Events) endpoint that streams Manus output to frontend.
    The frontend must use EventSource to connect.
    """
    async def event_generator():
        try:
            async for chunk in agent.run_stream(prompt):
                # SSE requires lines starting with "data:"
                yield f"data: {chunk}\n\n"
        except Exception as e:
            yield f"data: ❌ Error: {str(e)}\n\n"

    # 👇 Set media_type to text/event-stream (required for EventSource)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

