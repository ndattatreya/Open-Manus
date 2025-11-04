import argparse
import asyncio
import json
from io import StringIO
import sys
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent.manus import Manus
from app.logger import logger

app = FastAPI(title="OpenManus API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str

@app.on_event("startup")
async def startup_event():
    app.state.agent = await Manus.create()
    logger.info("✅ Manus agent initialized.")

@app.on_event("shutdown")
async def shutdown_event():
    await app.state.agent.cleanup()
    logger.info("🧹 Manus agent cleaned up.")

@app.get("/stream")
async def stream_prompt(prompt: str, request: Request):
    """SSE streaming endpoint for prompt generation."""
    agent = app.state.agent

    async def event_generator():
        try:
            async for line in agent.run_stream(prompt):
                yield f"data: {json.dumps({'message': line})}\n\n"
                await asyncio.sleep(0.05)
        except Exception as e:
            logger.error(f"❌ Stream crashed: {e}")
            yield f"data: {json.dumps({'message': f'❌ Stream crashed: {e}'})}\n\n"
        finally:
            yield "event: end\ndata: {}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

@app.post("/run")
async def run_prompt(data: PromptRequest):
    """Fallback non-stream endpoint."""
    prompt = data.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    buffer = StringIO()
    sys.stdout = buffer
    try:
        await app.state.agent.run(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        sys.stdout = sys.__stdout__

    output = buffer.getvalue()
    return {"status": "success", "output": output}

def run_api():
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

def main():
    parser = argparse.ArgumentParser(description="Run Manus agent (CLI or API mode)")
    parser.add_argument("--prompt", type=str, help="Prompt for Manus", required=False)
    parser.add_argument("--api", action="store_true", help="Run as API server")
    args = parser.parse_args()

    if args.api:
        run_api()
    else:
        asyncio.run(run_cli(args.prompt))

async def run_cli(prompt: str | None):
    agent = await Manus.create()
    try:
        text = prompt or input("Enter your prompt: ")
        if not text.strip():
            logger.warning("Empty prompt provided.")
            return
        await agent.run(text)
    finally:
        await agent.cleanup()

if __name__ == "__main__":
    main()
