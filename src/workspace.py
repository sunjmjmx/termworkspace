"""Workspace management for TermWorkspace.

Provides:
  - WorkspaceConfig / WindowConfig: data classes for persistence
  - ProviderConfig / AppConfig: global application configuration
  - WorkspaceManager: CRUD singleton for workspaces
  - WorkspaceView: Textual widget that hosts 1-4 AIWindowPanels in split layouts
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from textual.containers import Grid, Horizontal, Vertical
from textual.widget import Widget

from window import AIWindowPanel


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class WindowConfig:
    """Configuration for a single AIWindowPanel within a workspace."""

    model_name: str = ""
    panel_id: str = ""


@dataclass
class WorkspaceConfig:
    """Configuration for a single workspace / tab."""

    name: str = "Workspace"
    layout: str = "single"  # single | horizontal | vertical | grid
    windows: list[WindowConfig] = field(default_factory=list)


@dataclass
class ProviderConfig:
    """Configuration for an LLM provider."""

    name: str = ""
    model: str = ""
    api_key: str = ""
    base_url: str = ""
    online: bool = True


@dataclass
class AppConfig:
    """Global application configuration."""

    providers: list[ProviderConfig] = field(default_factory=list)
    workspaces: list[WorkspaceConfig] = field(default_factory=list)
    token_usage: int = 0
    background_tasks: int = 0

    @property
    def available_models(self) -> list[str]:
        """Return a list of model names from all configured providers."""
        return [
            f"{p.name}/{p.model}" if p.model else p.name for p in self.providers
        ]

    @property
    def online_model_count(self) -> int:
        """Return the number of providers that are online."""
        return sum(1 for p in self.providers if p.online)


# Default global config (kept in memory, can be loaded/saved later)
_DEFAULT_PROVIDERS = [
    ProviderConfig(name="OpenAI", model="gpt-4", api_key="", base_url="", online=True),
    ProviderConfig(name="Anthropic", model="claude-3-opus", api_key="", base_url="", online=True),
    ProviderConfig(name="Nous", model="hermes-3", api_key="", base_url="", online=True),
    ProviderConfig(name="DeepSeek", model="deepseek-v3", api_key="", base_url="", online=True),
]

global_config: AppConfig = AppConfig(providers=_DEFAULT_PROVIDERS)


# ── WorkspaceManager ──────────────────────────────────────────────────────────


class WorkspaceManager:
    """Singleton manager for workspace CRUD operations."""

    _instance: WorkspaceManager | None = None

    def __new__(cls) -> WorkspaceManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._workspaces: dict[str, WorkspaceConfig] = {}
            cls._instance._counter = 0
        return cls._instance

    # ── Create ──

    def create_workspace(self, name: str = "Workspace", layout: str = "single") -> str:
        """Create a new workspace config and return its ID."""
        self._counter += 1
        ws_id = f"ws-{self._counter}"
        # Create default windows for the layout
        window_count = {"single": 1, "horizontal": 2, "vertical": 2, "grid": 4}
        windows = [
            WindowConfig(panel_id=f"{ws_id}-panel-{i}")
            for i in range(window_count.get(layout, 1))
        ]
        config = WorkspaceConfig(name=name, layout=layout, windows=windows)
        self._workspaces[ws_id] = config
        return ws_id

    # ── Read ──

    def get_workspace(self, ws_id: str) -> WorkspaceConfig | None:
        """Get a workspace config by ID."""
        return self._workspaces.get(ws_id)

    def list_workspaces(self) -> dict[str, WorkspaceConfig]:
        """Return all workspace configs."""
        return dict(self._workspaces)

    # ── Update ──

    def update_workspace(
        self, ws_id: str, *, name: str | None = None, layout: str | None = None
    ) -> bool:
        """Update a workspace's properties. Returns True on success."""
        config = self._workspaces.get(ws_id)
        if config is None:
            return False
        if name is not None:
            config.name = name
        if layout is not None:
            old_window_count = len(config.windows)
            new_count = {"single": 1, "horizontal": 2, "vertical": 2, "grid": 4}
            target = new_count.get(layout, old_window_count)
            # Adjust windows list to match new layout
            if target > old_window_count:
                for i in range(old_window_count, target):
                    config.windows.append(WindowConfig(panel_id=f"{ws_id}-panel-{i}"))
            elif target < old_window_count:
                config.windows = config.windows[:target]
            config.layout = layout
        return True

    # ── Delete ──

    def delete_workspace(self, ws_id: str) -> bool:
        """Delete a workspace config. Returns True on success."""
        if ws_id in self._workspaces:
            del self._workspaces[ws_id]
            return True
        return False


# ── WorkspaceView ─────────────────────────────────────────────────────────────


class WorkspaceView(Widget):
    """A workspace view that hosts 1-4 AIWindowPanels in a split layout.

    Layout modes:
      - 'single':     1 panel fills the entire view
      - 'horizontal': 2 panels side-by-side (left / right)
      - 'vertical':   2 panels stacked (top / bottom)
      - 'grid':       4 panels in a 2×2 grid
    """

    DEFAULT_CSS = """
    WorkspaceView {
        height: 100%;
        width: 100%;
        padding: 0;
        margin: 0;
    }

    WorkspaceView > Grid {
        height: 100%;
        width: 100%;
    }
    """

    def __init__(
        self,
        layout: str = "single",
        ws_id: str = "ws-0",
        panel_count: int | None = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._ws_id = ws_id
        self._layout = layout
        self._panel_count = panel_count or {"single": 1, "horizontal": 2, "vertical": 2, "grid": 4}.get(layout, 1)
        self._panels: list[AIWindowPanel] = []
        self._available_models: list[str] = global_config.available_models

    # ── Properties ──

    @property
    def layout(self) -> str:
        return self._layout

    @layout.setter
    def layout(self, value: str) -> None:
        if value != self._layout and value in ("single", "horizontal", "vertical", "grid"):
            self._layout = value
            self._rebuild_layout()

    @property
    def panels(self) -> list[AIWindowPanel]:
        return list(self._panels)

    # ── Lifecycle ──

    def compose(self):
        self._panels.clear()
        grid = Grid(id=f"{self._ws_id}-grid")

        target_count = {"single": 1, "horizontal": 2, "vertical": 2, "grid": 4}.get(
            self._layout, 1
        )
        for i in range(target_count):
            panel = AIWindowPanel(
                available_models=self._available_models,
                panel_index=i,
                id=f"{self._ws_id}-panel-{i}",
            )
            self._panels.append(panel)

        yield grid

    def on_mount(self) -> None:
        """Apply grid CSS rules after mount."""
        self._apply_grid_layout()

    # ── Layout management ──

    def _apply_grid_layout(self) -> None:
        """Dynamically set the grid template based on layout mode."""
        grid = self.query_one(f"#{self._ws_id}-grid", Grid)
        if self._layout == "single":
            grid.styles.grid_size_columns = 1
            grid.styles.grid_size_rows = 1
        elif self._layout == "horizontal":
            grid.styles.grid_size_columns = 2
            grid.styles.grid_size_rows = 1
        elif self._layout == "vertical":
            grid.styles.grid_size_columns = 1
            grid.styles.grid_size_rows = 2
        elif self._layout == "grid":
            grid.styles.grid_size_columns = 2
            grid.styles.grid_size_rows = 2
        grid.refresh(layout=True)

    def _rebuild_layout(self) -> None:
        """Rebuild the panel layout when the layout mode changes."""
        grid = self.query_one(f"#{self._ws_id}-grid", Grid)
        grid.remove_children()

        target_count = {"single": 1, "horizontal": 2, "vertical": 2, "grid": 4}.get(
            self._layout, 1
        )

        # Reuse existing panels if possible, else create new ones
        old_panels = list(self._panels)
        self._panels.clear()

        for i in range(target_count):
            if i < len(old_panels):
                panel = old_panels[i]
            else:
                panel = AIWindowPanel(
                    available_models=self._available_models,
                    panel_index=i,
                    id=f"{self._ws_id}-panel-{i}",
                )
            self._panels.append(panel)
            grid.mount(panel)

        self._apply_grid_layout()

    # ── Public API ──

    def set_layout(self, layout: str) -> None:
        """Change the split layout mode."""
        self.layout = layout

    def split_horizontal(self) -> None:
        """Split the workspace into left/right panels."""
        self.set_layout("horizontal")

    def split_vertical(self) -> None:
        """Split the workspace into top/bottom panels."""
        self.set_layout("vertical")

    def split_grid(self) -> None:
        """Split the workspace into a 2×2 grid."""
        self.set_layout("grid")

    def merge_all(self) -> None:
        """Merge back to a single panel."""
        self.set_layout("single")

    def refresh_available_models(self) -> None:
        """Refresh the model list from global config for all panels."""
        self._available_models = global_config.available_models
        for panel in self._panels:
            panel.update_available_models(self._available_models)
