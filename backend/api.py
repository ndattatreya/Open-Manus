import asyncio
import base64
import io
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import json

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
        "https://open-manus-blue.vercel.app/",
        "https://*.vercel.app",
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
# 🔹 Helper for OpenRouter Calls
# ======================================================

def call_openrouter(prompt: str, system_instruction: str = None):
    """Calls OpenRouter Llama 3.3 70B (free or fallback) for smart text/code generation."""
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY")

    # Prepare message sequence
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://navaai.vercel.app",
        "X-Title": "NavaAI",
    }

    # Primary model
    models_to_try = [
        "meta-llama/llama-3.3-70b-instruct:free",  # ✅ new reliable free model
        "mistralai/mixtral-8x7b",                  # fallback model
    ]

    for model in models_to_try:
        payload = {"model": model, "messages": messages}
        print(f"🧠 Trying OpenRouter model: {model}")
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            data=json.dumps(payload),
        )

        if response.status_code == 200:
            data = response.json()
            return data["choices"][0]["message"]["content"]

        print(f"⚠️ Model {model} failed ({response.status_code}): {response.text}")

    raise HTTPException(status_code=500, detail="All OpenRouter models failed.")

# ======================================================
# 🔹 Main Unified Prompt Router
# ======================================================

@app.post("/api/run")
async def run_prompt(request: PromptRequest):
    """
    Unified intelligent route — automatically detects intent.
    Uses ClipDrop for images, SlidesGPT for presentations,
    and OpenRouter for everything else.
    """
    prompt = request.prompt.strip()
    print("🧠 Received prompt:", prompt)

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    clipdrop_key = os.getenv("CLIPDROP_API_KEY")
    slidesgpt_key = os.getenv("SLIDESGPT_API_KEY")  # <-- add this

    if not openrouter_key:
        raise HTTPException(status_code=500, detail="Missing OPENROUTER_API_KEY")

    # ======================================================
    # 🧠 1️⃣ Detect Intent (semantic classification)
    # ======================================================
    intent_prompt = f"""
    Classify the following request into exactly one category:
    - image
    - code
    - website
    - presentation
    - text

    User prompt: "{prompt}"
    """

    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://navaai.vercel.app",
        "X-Title": "NavaAI",
    }

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        data=json.dumps({
            "model": "meta-llama/llama-3.1-8b-instruct:free",
            "messages": [{"role": "user", "content": intent_prompt}]
        }),
    )

    if not response.ok:
        print("⚠️ Intent detection failed:", response.text)
        intent = "text"
    else:
        intent = response.json()["choices"][0]["message"]["content"].strip().lower()
        print(f"🎯 Detected intent: {intent}")

    # ======================================================
    # 🎨 2️⃣ IMAGE via ClipDrop
    # ======================================================
    if "image" in intent:
        print("🎨 Generating image via ClipDrop...")
        try:
            if not clipdrop_key:
                return {"type": "image", "image_url": "https://placehold.co/1024x1024?text=Missing+ClipDrop+Key"}

            img_res = requests.post(
                "https://clipdrop-api.co/text-to-image/v1",
                files={"prompt": (None, prompt, "text/plain")},
                headers={"x-api-key": clipdrop_key},
                timeout=60,
            )
            if img_res.ok:
                img_b64 = base64.b64encode(img_res.content).decode("utf-8")
                return {"type": "image", "image_url": f"data:image/png;base64,{img_b64}"}
            return {"type": "image", "image_url": "https://placehold.co/1024x1024?text=ClipDrop+Error"}
        except Exception as e:
            print("🔥 ClipDrop error:", str(e))
            return {"type": "image", "image_url": "https://placehold.co/1024x1024?text=Error"}

    # ======================================================
    # 🖼️ 3️⃣ PRESENTATION via SlidesGPT
    # ======================================================
    if "presentation" in intent or "ppt" in intent:
        print("🖼️ Generating presentation via SlidesGPT...")
        try:
            if not slidesgpt_key:
                return {"type": "ppt", "slides": ["Missing SLIDESGPT_API_KEY"]}

            slides_res = requests.post(
                "https://api.slidesgpt.com/v1/presentations",
                headers={
                    "Authorization": f"Bearer {slidesgpt_key}",
                    "Content-Type": "application/json",
                },
                json={"prompt": prompt},
                timeout=120,
            )

            if slides_res.ok:
                slides_data = slides_res.json()
                print("✅ SlidesGPT response received.")
                return {"type": "ppt", "slides": slides_data}
            else:
                print("⚠️ SlidesGPT API error:", slides_res.text)
                return {"type": "ppt", "slides": ["SlidesGPT API error"]}
        except Exception as e:
            print("🔥 SlidesGPT generation error:", str(e))
            return {"type": "ppt", "slides": ["Error generating presentation"]}

    # ======================================================
    # 💻 4️⃣ CODE via OpenRouter
    # ======================================================
    if "code" in intent:
        print("💻 Generating code via OpenRouter...")
        result = call_openrouter(prompt, "Return only runnable code, no markdown or explanations.")
        return {"type": "code", "output": result}

    # ======================================================
    # 🌐 5️⃣ WEBSITE via OpenRouter
    # ======================================================
    if "website" in intent:
        print("🌐 Generating website via OpenRouter...")
        html = call_openrouter(prompt, "Generate full HTML, CSS, JS for a complete website.")
        if not html.lower().startswith("<!doctype html"):
            html = "<!DOCTYPE html>\n" + html
        return {"type": "website", "html": html}

    # ======================================================
    # 🧾 6️⃣ TEXT (Default)
    # ======================================================
    print("🧾 Generating text via OpenRouter...")
    output = call_openrouter(prompt)
    return {"type": "text", "output": output}

# ======================================================
# 🔹 Code / PPT / Website Endpoints (Unchanged)
# ======================================================
class ImageRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"

@app.post("/api/generate-image")
async def generate_image(req: ImageRequest):
    """Legacy image endpoint (uses ClipDrop)"""
    try:
        clipdrop_api_key = os.getenv("CLIPDROP_API_KEY")
        if not clipdrop_api_key:
            raise HTTPException(status_code=500, detail="Missing CLIPDROP_API_KEY")

        response = requests.post(
            "https://clipdrop-api.co/text-to-image/v1",
            files={"prompt": (None, req.prompt, "text/plain")},
            headers={"x-api-key": clipdrop_api_key},
            timeout=60,
        )

        if response.ok:
            image_bytes = response.content
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            image_url = f"data:image/png;base64,{base64_image}"
            return {"type": "image", "image_url": image_url}
        else:
            return {"type": "image", "image_url": "https://placehold.co/1024x1024?text=ClipDrop+Error"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


@app.post("/api/generate-ppt")
async def generate_ppt(request: PromptRequest):
    try:
        if not agent:
            raise HTTPException(status_code=503, detail="Agent not ready yet.")
        slides_text = await agent.run(f"Generate PowerPoint slide content for: {request.prompt}")
        slides = slides_text.split("\n\n")
        return {"type": "ppt", "slides": slides}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPT generation failed: {str(e)}")


@app.post("/api/live-preview")
async def live_preview(request: PromptRequest):
    try:
        if not agent:
            raise HTTPException(status_code=503, detail="Agent not ready yet.")
        result = await agent.run(f"Generate full HTML/CSS/JS code for: {request.prompt}")
        html_content = result.strip()
        return JSONResponse({"type": "website", "html": html_content})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Website generation failed: {str(e)}")
