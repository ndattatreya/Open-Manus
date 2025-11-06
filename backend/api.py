import asyncio
import base64
import io
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import replicate
import requests

from app.agent.manus import Manus
from app.logger import logger

# ======================================================
# 🔹 FastAPI Setup
# ======================================================
app = FastAPI(title="OpenManus Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://navaai.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "OpenManus backend is running."}

# ======================================================
# 🔹 Agent Initialization
# ======================================================
agent = None

@app.on_event("startup")
async def startup_event():
    """Initialize Manus agent asynchronously"""
    global agent

    async def initialize_agent():
        try:
            logger.info("🧠 Initializing Manus agent...")
            global agent
            agent = await Manus.create()
            logger.info("✅ Manus agent ready.")
        except Exception as e:
            logger.error(f"❌ Manus initialization failed: {e}")

    asyncio.create_task(initialize_agent())

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up Manus"""
    global agent
    if agent:
        await agent.cleanup()
        logger.info("🧹 Manus agent cleaned up.")


# ======================================================
# 🔹 Request Model
# ======================================================
class PromptRequest(BaseModel):
    prompt: str


# ======================================================
# 🔹 Main Prompt Router (Detect Intent)
# ======================================================
import re, json, os
from datetime import datetime

HISTORY_FILE = "app/data/code_history.json"


def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(history):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

#================================================================

class PromptRequest(BaseModel):
    prompt: str

@app.post("/api/run")
async def run_prompt(request: PromptRequest):
    """
    Unified intelligent route — handles code, PPT, image, website, and text.
    Uses Replicate for images directly (no OpenAI billing needed).
    """
    prompt = request.prompt.strip()
    lower_prompt = prompt.lower()

    print("🧠 Received prompt:", prompt)

    # ======================================================
    # 🎨 1️⃣ IMAGE GENERATION (Direct Replicate API)
    # ======================================================
    if any(x in lower_prompt for x in ["image", "photo", "picture", "illustrate", "draw"]):
        print("🎨 Generating image via Replicate API...")

        try:
            replicate_api_key = os.getenv("REPLICATE_API_TOKEN")

            if not replicate_api_key:
                print("⚠️ Missing REPLICATE_API_TOKEN environment variable.")
                placeholder_url = "https://placehold.co/1024x1024?text=Missing+API+Key"
                return {"type": "image", "image_url": placeholder_url}

            client = replicate.Client(api_token=os.getenv("REPLICATE_API_TOKEN"))
            output = client.run(
                "stability-ai/sdxl",
                input={"prompt": "a golden retriever in a spacesuit", "width": 512, "height": 512}
            )

            image_url = output[0] if isinstance(output, list) else output
            print("✅ Image generated successfully:", image_url)
            return {"type": "image", "image_url": image_url}

        except Exception as e:
            print("🔥 Image generation error:", str(e))
            placeholder_url = "https://placehold.co/1024x1024?text=Image+Generation+Failed"
            return {"type": "image", "image_url": placeholder_url}

    # ======================================================
    # 💻 2️⃣ CODE GENERATION
    # ======================================================
    if any(x in lower_prompt for x in ["python", "react", "node", "api", "frontend", "typescript", "script"]):
        print("💻 Generating code...")
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        code_output = client.responses.create(
            model="gpt-4o-mini",
            input=f"Return only runnable code for this prompt:\n{prompt}",
        ).output_text.strip()

        code = re.sub(r"```[a-zA-Z0-9]*", "", code_output).replace("```", "").strip()
        return {"type": "code", "output": code}

    # ======================================================
    # 🌐 3️⃣ WEBSITE GENERATION
    # ======================================================
    if any(x in lower_prompt for x in ["website", "landing page", "portfolio", "home page", "html"]):
        print("🌐 Generating website HTML...")
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        code = client.responses.create(
            model="gpt-4o-mini",
            input=f"Generate clean HTML, CSS, and JS for: {prompt}. "
                  f"Do NOT include markdown or comments."
        ).output_text.strip()

        if not code.lower().startswith("<!doctype html"):
            code = "<!DOCTYPE html>\n" + code
        return {"type": "website", "html": code}

    # ======================================================
    # 🧾 4️⃣ TEXT GENERATION (DEFAULT)
    # ======================================================
    print("🧾 Generating text response...")
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    text_result = client.responses.create(
        model="gpt-4o-mini",
        input=prompt,
    ).output_text.strip()

    return {"type": "text", "output": text_result}

# ======================================================
# 🔹 Code Generation
# ======================================================
@app.post("/api/generate-code")
async def generate_code(request: PromptRequest):
    """Generate code (returns as plain text for frontend display)."""
    try:
        if not agent:
            raise HTTPException(status_code=503, detail="Agent not ready yet.")
        result = await agent.run(request.prompt)
        return {"type": "code", "language": "auto", "output": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")


# ======================================================
# 🔹 PPT Generation
# ======================================================
@app.post("/api/generate-ppt")
async def generate_ppt(request: PromptRequest):
    """Generate PPT content (as structured slides JSON)."""
    try:
        if not agent:
            raise HTTPException(status_code=503, detail="Agent not ready yet.")

        slides_text = await agent.run(f"Generate PowerPoint slide content for: {request.prompt}")
        slides = slides_text.split("\n\n")  # simple split per slide
        return {"type": "ppt", "slides": slides}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPT generation failed: {str(e)}")


# ======================================================
# 🔹 Image Generation
# ======================================================
class ImageRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"

@app.post("/api/generate-image")
async def generate_image(req: ImageRequest):
    """Generate an image using OpenAI or OpenRouter."""
    try:
        openai_key = os.getenv("OPENAI_API_KEY")
        openrouter_key = os.getenv("OPENROUTER_API_KEY")

        if not openai_key and not openrouter_key:
            raise HTTPException(status_code=500, detail="No API keys found.")

        payload = {
            "model": "dall-e-3",
            "prompt": req.prompt,
            "size": req.size,
        }

        # Try OpenAI first
        if openai_key:
            headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
            response = requests.post("https://api.openai.com/v1/images/generations", headers=headers, json=payload)
            if response.status_code == 200:
                image_base64 = response.json()["data"][0]["b64_json"]
                image_bytes = base64.b64decode(image_base64)
                return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")

        # Fallback: OpenRouter
        if openrouter_key:
            headers = {
                "Authorization": f"Bearer {openrouter_key}",
                "HTTP-Referer": "https://navaai.vercel.app",
                "X-Title": "NavaAI",
                "Content-Type": "application/json",
            }
            response = requests.post("https://openrouter.ai/api/v1/images/generations", headers=headers, json=payload)
            if response.status_code == 200:
                image_base64 = response.json()["data"][0]["b64_json"]
                image_bytes = base64.b64decode(image_base64)
                return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")

        raise HTTPException(status_code=500, detail="All image generation services failed.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


# ======================================================
# 🔹 Website / Live Preview
# ======================================================
@app.post("/api/live-preview")
async def live_preview(request: PromptRequest):
    """Generate HTML/CSS/JS website code for live preview."""
    try:
        if not agent:
            raise HTTPException(status_code=503, detail="Agent not ready yet.")

        result = await agent.run(f"Generate full HTML/CSS/JS code for: {request.prompt}")
        html_content = result.strip()
        return JSONResponse({"type": "website", "html": html_content})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Website generation failed: {str(e)}")
