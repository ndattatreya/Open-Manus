import argparse
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from io import StringIO
import sys
import uvicorn

from app.agent.manus import Manus
from app.logger import logger


# -----------------------  FASTAPI SECTION  -----------------------
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


@app.post("/run")
async def run_prompt(data: PromptRequest):
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


# -----------------------  CLI SECTION  -----------------------
async def run_cli(prompt: str | None):
    """Run the Manus agent directly from CLI"""
    agent = await Manus.create()
    try:
        text = prompt or input("Enter your prompt: ")
        if not text.strip():
            logger.warning("Empty prompt provided.")
            return
        logger.warning("Processing your request...")
        await agent.run(text)
        logger.info("Request processing completed.")
    except KeyboardInterrupt:
        logger.warning("Operation interrupted.")
    finally:
        await agent.cleanup()


def run_api():
    """Start FastAPI server (no nested asyncio.run)"""
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


if __name__ == "__main__":
    main()
