from app.tool.base import BaseTool, ToolResult
import requests
import os
from app.config import config

class ImageGenerationTool(BaseTool):
    name: str = "generate_image"
    description: str = "Generates an image based on a textual description (prompt) using Clipdrop API."
    parameters: dict = {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "A detailed description of the image to generate.",
            },
            "filename": {
                "type": "string",
                "description": "The filename to save the image to. Should end with .png.",
            },
        },
        "required": ["prompt", "filename"],
    }

    async def execute(self, prompt: str, filename: str) -> ToolResult:
        """
        Generates an image and saves it using Clipdrop API.
        """
        if not filename.endswith(".png"):
            return ToolResult(error="Filename must end with .png")

        image_settings = config.llm.get("image")
        api_key = image_settings.api_key if image_settings and hasattr(image_settings, "api_key") else None
        if not api_key or api_key == "YOUR_CLIPDROP_API_KEY":
            return ToolResult(error="Clipdrop API key not found in config.toml under [llm.image]")

        try:
            # Make the API call to Clipdrop
            response = requests.post('https://clipdrop-api.co/text-to-image/v1',
                files = {
                    'prompt': (None, prompt, 'text/plain')
                },
                headers = { 'x-api-key': api_key }
            )

            response.raise_for_status()  # Raise an exception for bad status codes

            image_data = response.content

            # Ensure the workspace directory exists
            workspace_dir = os.path.join(os.getcwd(), 'workspace')
            if not os.path.exists(workspace_dir):
                os.makedirs(workspace_dir)

            filepath = os.path.join(workspace_dir, filename)
            with open(filepath, "wb") as f:
                f.write(image_data)

            return ToolResult(output=f"Image successfully generated and saved to {filepath}")

        except requests.exceptions.RequestException as e:
            return ToolResult(error=f"API request failed: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Failed to generate or save image: {str(e)}")
