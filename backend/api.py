import asyncio
import base64
import io
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from app.agent.manus import Manus
from app.logger import logger
import requests

# ✅ Initialize FastAPI
app = FastAPI(title="OpenManus Backend API")

# ✅ Allow both local & deployed frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://navaai.vercel.app",  # your deployed frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Simple health check for Render’s port detection
@app.get("/")
async def root():
    return {"status": "ok", "message": "OpenManus backend is running."}


# ================================
# 🔹 Manus Agent Setup
# ================================

agent = None  # Global Manus agent


@app.on_event("startup")
async def startup_event():
    """Initialize the Manus agent in background."""
    global agent

    async def initialize_agent():
        global agent
        try:
            logger.info("🧠 Starting Manus initialization in background...")
            agent = await Manus.create()
            logger.info("✅ Manus agent initialized.")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Manus: {e}")

    asyncio.create_task(initialize_agent())


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup Manus agent."""
    global agent
    if agent:
        await agent.cleanup()
        logger.info("🧹 Manus agent cleaned up.")


# ================================
# 🔹 Text Generation Routes
# ================================

class PromptRequest(BaseModel):
    prompt: str


@app.post("/api/run")
async def run_prompt(request: PromptRequest):
    """Run a simple non-streaming task with Manus."""
    if not agent:
        return {"error": "Agent not ready yet. Please retry after a few seconds."}
    await agent.run(request.prompt)
    return {"message": "Prompt processed successfully."}


@app.get("/stream")
async def stream_prompt(prompt: str):
    """Stream Manus reasoning output to frontend (SSE)."""
    if not agent:
        async def not_ready():
            yield "data: ❌ Agent still starting. Please retry.\n\n"
        return StreamingResponse(not_ready(), media_type="text/event-stream")

    async def event_generator():
        try:
            async for chunk in agent.run_stream(prompt):
                yield f"data: {chunk}\n\n"
        except Exception as e:
            yield f"data: ❌ Error: {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ================================
# 🔹 Image Generation Route
# ================================

class ImageRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"  # can be 256x256, 512x512, or 1024x1024

@app.post("/api/generate-image")
async def generate_image(req: ImageRequest):
    """
    Generates an image using OpenAI first, falls back to OpenRouter if needed.
    """
    try:
        # 🔑 Load API keys
        openai_key = os.getenv("OPENAI_API_KEY")
        openrouter_key = os.getenv("OPENROUTER_API_KEY")

        if not openai_key and not openrouter_key:
            raise HTTPException(status_code=500, detail="No API keys found in environment")

        # ⚙️ Base settings
        payload = {
            "model": "dall-e-3",
            "prompt": req.prompt,
            "size": req.size,
        }

        # ======== TRY OPENAI FIRST =========
        if openai_key:
            print("🧠 Trying OpenAI API...")
            base_url = "https://api.openai.com/v1/images/generations"
            headers = {
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            }

            response = requests.post(base_url, headers=headers, json=payload, timeout=60)

            if response.status_code == 200:
                image_base64 = response.json()["data"][0]["b64_json"]
                image_bytes = base64.b64decode(image_base64)
                return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")
            else:
                print("⚠️ OpenAI image gen failed:", response.text)

        # ======== FALLBACK: OPENROUTER =========
        if openrouter_key:
            print("🌐 Falling back to OpenRouter...")
            base_url = "https://openrouter.ai/api/v1/images/generations"
            headers = {
                "Authorization": f"Bearer {openrouter_key}",
                "HTTP-Referer": "https://navaai.vercel.app",
                "X-Title": "NavaAI",
                "Content-Type": "application/json",
            }

            response = requests.post(base_url, headers=headers, json=payload, timeout=60)

            if response.status_code == 200:
                image_base64 = response.json()["data"][0]["b64_json"]
                image_bytes = base64.b64decode(image_base64)
                return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")

            print("⚠️ OpenRouter image gen failed:", response.text)
            raise HTTPException(status_code=response.status_code, detail=response.text)

        # ======== IF ALL FAIL =========
        raise HTTPException(status_code=500, detail="All image generation providers failed")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")