"""TermWorkspace — 终端原生多模型 AI 工作台。

Bring your own API keys, compose models across split-panel tabs,
no platform lock-in.
"""

__version__ = "0.1.0"

from .app import main, TermWorkspaceApp
from .config import ConfigManager
from .providers import ProviderManager, send_message
from .workspace import WorkspaceManager, WorkspaceView, global_config

__all__ = [
    "main",
    "TermWorkspaceApp",
    "ConfigManager",
    "ProviderManager",
    "send_message",
    "WorkspaceManager",
    "WorkspaceView",
    "global_config",
]
