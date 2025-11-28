from typing import Any, Callable, Optional

from app.agent.toolcall import ToolCallAgent
from app.config import config
from app.prompt.manus import NEXT_STEP_PROMPT, SYSTEM_PROMPT
from app.tool import Terminate, ToolCollection
from app.tool.tavily_search import TavilyTool
from app.tool.image_generation import ImageGenerationTool
from app.tool.pptx_generation import PptxGenerationTool
from app.tool.python_execute import PythonExecute
from app.tool.str_replace_editor import StrReplaceEditor
from app.tool.user_input import UserInputTool
from pydantic import Field, PrivateAttr, model_validator


class Manus(ToolCallAgent):
    """A versatile general-purpose agent."""

    name: str = "Manus"
    description: str = (
        "A versatile agent that can solve various tasks using multiple tools"
    )

    system_prompt: str = SYSTEM_PROMPT.format(directory=config.workspace_root)
    next_step_prompt: str = NEXT_STEP_PROMPT

    max_observe: int = 10000
    max_steps: int = 20

    # Add general-purpose tools to the tool collection
    # Note: UserInputTool is added via set_input_callback() method with proper callback
    available_tools: ToolCollection = Field(
        default_factory=lambda: ToolCollection(
            PythonExecute(),
            TavilyTool(),
            StrReplaceEditor(),
            ImageGenerationTool(),
            PptxGenerationTool(),
            Terminate(),
        )
    )

    special_tool_names: list[str] = Field(default_factory=lambda: [Terminate().name])

    _input_callback: Optional[Callable[[str], Any]] = PrivateAttr(default=None)

    def set_input_callback(self, callback: Callable[[str], Any]):
        """Set the callback for user input and add the tool."""
        from app.logger import logger

        self._input_callback = callback
        user_input_tool = UserInputTool(input_func=callback)
        self.available_tools.add_tool(user_input_tool)
        logger.info(
            f"✅ Registered UserInputTool with callback. Tool map now has {len(self.available_tools.tool_map)} tools"
        )
        logger.debug(f"🔍 Available tools: {list(self.available_tools.tool_map.keys())}")

    async def think(self) -> bool:
        """Process current state and decide next actions with appropriate context."""
        return await super().think()

    async def cleanup(self):
        """Clean up Manus agent resources."""
        pass
