"""TermWorkspace — A terminal-based AI workspace with split-panel conversations.

Entry point::
    textual run src/app.py

Or from project root::
    python3 -m src.app

Keyboard shortcuts:
  Ctrl+T  → New tab
  Ctrl+W  → Close current tab
  Ctrl+Q  → Quit
"""

from __future__ import annotations
import asyncio
import os
import sys

# Ensure src is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.widgets import (
    Button,
    Footer,
    Header,
    Label,
    Static,
    TabbedContent,
    TabPane,
)

from window import AIWindowPanel
from workspace import WorkspaceView, WorkspaceManager, global_config
from providers import ProviderManager as RealProviderManager
from providers import send_message
from config import ConfigManager


# ── StatusBar ─────────────────────────────────────────────────────────────────


class StatusBar(Static):
    """Bottom status bar showing online models, token usage, and background tasks."""

    online_models: reactive[int] = reactive(0)
    token_usage: reactive[int] = reactive(0)
    background_tasks: reactive[int] = reactive(0)

    DEFAULT_CSS = """
    StatusBar {
        height: 1;
        background: $panel;
        color: $text;
        padding: 0 1;
        layer: status;
    }

    StatusBar Horizontal {
        height: 1;
        align: left center;
    }

    .status-item {
        width: auto;
        padding: 0 2;
        text-style: bold;
    }

    .status-item.online {
        color: $success;
    }

    .status-item.tokens {
        color: $accent;
    }

    .status-item.tasks {
        color: $warning;
    }

    .status-separator {
        width: 1;
        color: $border;
    }
    """

    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Label("● Models: 0", id="status-models", classes="status-item online")
            yield Label("│", classes="status-separator")
            yield Label("Tokens: 0", id="status-tokens", classes="status-item tokens")
            yield Label("│", classes="status-separator")
            yield Label("Tasks: 0", id="status-tasks", classes="status-item tasks")

    def watch_online_models(self, count: int) -> None:
        label = self.query_one("#status-models", Label)
        label.update(f"● Models: {count}")

    def watch_token_usage(self, count: int) -> None:
        label = self.query_one("#status-tokens", Label)
        label.update(f"Tokens: {count}")

    def watch_background_tasks(self, count: int) -> None:
        label = self.query_one("#status-tasks", Label)
        label.update(f"Tasks: {count}")


# ── Main App ──────────────────────────────────────────────────────────────────


class TermWorkspaceApp(App):
    """TermWorkspace — A terminal-based AI workspace application."""

    TITLE = "TermWorkspace"
    SUB_TITLE = "Multi-window AI workspace"

    CSS = """
    /* ══════════════════════════════════════════════════════════════
       TermWorkspace — Global Styles
       ══════════════════════════════════════════════════════════════ */

    Screen {
        background: $surface;
    }

    /* ── Header ────────────────────────────────────────────────── */

    Header {
        background: $primary;
        color: $text;
        height: 1;
        padding: 0 1;
    }

    /* ── Tabbed Content ────────────────────────────────────────── */

    TabbedContent {
        height: 1fr;
        width: 100%;
        border: none;
    }

    TabbedContent > ContentSwitcher > Container {
        height: 100%;
        width: 100%;
    }

    TabbedContent > HeaderBar {
        background: $panel;
        color: $text;
        height: 1;
    }

    TabbedContent > HeaderBar > Tab {
        padding: 0 2;
        min-width: 12;
        text-align: center;
    }

    TabbedContent > HeaderBar > Tab.-active {
        background: $primary;
        color: $text;
        text-style: bold;
    }

    TabbedContent > HeaderBar > Tab:hover {
        background: $boost;
    }

    TabPane {
        height: 100%;
        width: 100%;
        padding: 0;
    }

    TabPane > WorkspaceView {
        height: 100%;
        width: 100%;
    }

    /* ── AIWindowPanel ─────────────────────────────────────────── */

    AIWindowPanel {
        border: solid $secondary;
        height: 100%;
        width: 100%;
        padding: 0;
        margin: 1;
    }

    AIWindowPanel:focus-within {
        border: solid $accent;
    }

    AIWindowPanel > Vertical {
        height: 100%;
        padding: 0 1 1 1;
    }

    AIWindowPanel .window-header {
        height: 3;
        min-height: 3;
        background: $surface;
        border-bottom: solid $border;
        padding: 0 1;
        align: center middle;
    }

    AIWindowPanel .model-select {
        width: 1fr;
        margin-right: 1;
    }

    AIWindowPanel Select {
        background: $surface;
        color: $text;
        border: solid $border;
    }

    AIWindowPanel Select:focus {
        border: solid $accent;
    }

    AIWindowPanel Select > SelectCurrent {
        padding: 0 1;
    }

    AIWindowPanel Select > SelectMenu {
        background: $surface;
        border: solid $border;
    }

    AIWindowPanel .model-status-label {
        width: auto;
        min-width: 10;
        margin: 0 1;
        text-align: center;
        text-style: bold;
    }

    AIWindowPanel .model-status-label.online {
        color: $success;
    }

    AIWindowPanel .model-status-label.offline {
        color: $error;
    }

    AIWindowPanel .model-status-label.thinking {
        color: $warning;
    }

    AIWindowPanel .clear-btn {
        width: auto;
        min-width: 8;
        margin-left: 1;
    }

    AIWindowPanel Button {
        background: $error;
        color: $text;
        border: none;
        padding: 0 2;
    }

    AIWindowPanel Button:hover {
        background: $error-darken-1;
    }

    AIWindowPanel .conversation-history {
        height: 1fr;
        border: solid $border;
        margin: 1 0;
        padding: 1;
        background: $surface;
        color: $text;
    }

    AIWindowPanel .conversation-history:focus {
        border: solid $accent;
    }

    AIWindowPanel TextArea {
        background: $surface;
        color: $text;
    }

    AIWindowPanel .input-area {
        height: 5;
        min-height: 5;
        border: solid $border;
        margin: 0;
        padding: 1;
        background: $surface;
        color: $text;
    }

    AIWindowPanel .input-area:focus {
        border: solid $accent;
    }

    /* ── StatusBar ─────────────────────────────────────────────── */

    StatusBar {
        height: 1;
        background: $panel;
        color: $text;
        padding: 0 1;
        dock: bottom;
    }

    StatusBar Horizontal {
        height: 1;
        align: left center;
    }

    StatusBar .status-item {
        width: auto;
        padding: 0 2;
        text-style: bold;
    }

    StatusBar .status-item.online {
        color: $success;
    }

    StatusBar .status-item.tokens {
        color: $accent;
    }

    StatusBar .status-item.tasks {
        color: $warning;
    }

    StatusBar .status-separator {
        width: 1;
        color: $border;
    }
    """

    BINDINGS = [
        Binding("ctrl+t", "new_tab", "New Tab", priority=True),
        Binding("ctrl+w", "close_tab", "Close Tab", priority=True),
        Binding("ctrl+q", "quit", "Quit", priority=True),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._ws_manager = WorkspaceManager()
        self._tab_counter = 0
        self._provider_mgr = RealProviderManager()
        self._config_mgr = ConfigManager()
        self._load_user_config()

    def _load_user_config(self) -> None:
        """Load user config from ~/.termworkspace/config.yaml."""
        config = self._config_mgr.load()
        if config and "providers" in config:
            self._provider_mgr.load_from_config(config["providers"])
            # Populate model list for workspace panels
            models = self._provider_mgr.get_available_models()
            global_config.providers.clear()
            for provider_name, model_name in models:
                from workspace import ProviderConfig as WSProvider
                global_config.providers.append(
                    WSProvider(name=provider_name, model=model_name, api_key="", base_url="", online=True)
                )
            global_config.available_models  # trigger property refresh

    # ── Compose ───────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(initial="tab-0"):
            with TabPane("Workspace 1", id="tab-0"):
                ws_id = self._ws_manager.create_workspace("Workspace 1")
                yield WorkspaceView(layout="single", ws_id=ws_id, id=f"wsv-{ws_id}")
        yield StatusBar(id="status-bar")

    def on_mount(self) -> None:
        """Post-mount setup: set initial status and focus first input."""
        self._tab_counter = 1
        self._update_status_bar()
        # Focus the input of the first panel in the first workspace
        self._focus_active_panel_input()

    # ── Tab Actions ───────────────────────────────────────────────

    def action_new_tab(self) -> None:
        """Create a new workspace tab (Ctrl+T)."""
        self._tab_counter += 1
        ws_name = f"Workspace {self._tab_counter}"
        ws_id = self._ws_manager.create_workspace(ws_name)
        tab_id = f"tab-{self._tab_counter}"

        tabs = self.query_one(TabbedContent)
        pane = TabPane(ws_name, id=tab_id)
        pane.mount(WorkspaceView(layout="single", ws_id=ws_id, id=f"wsv-{ws_id}"))
        tabs.add_pane(pane)
        tabs.active = tab_id
        self._update_status_bar()
        self._focus_active_panel_input()

    def action_close_tab(self) -> None:
        """Close the currently active tab (Ctrl+W)."""
        tabs = self.query_one(TabbedContent)
        active = tabs.active

        if active is None:
            return

        # Don't close the last tab
        panes = list(tabs.query(TabPane))
        if len(panes) <= 1:
            self.notify("Cannot close the last workspace tab", severity="warning", timeout=3)
            return

        # Extract ws_id from the pane's child WorkspaceView
        ws_id = None
        try:
            pane = tabs.get_pane(active)
            wsv = pane.query_one(WorkspaceView)
            ws_id = wsv._ws_id
        except NoMatches:
            pass

        tabs.remove_pane(active)

        if ws_id:
            self._ws_manager.delete_workspace(ws_id)

        self._update_status_bar()

    # ── Status Bar Updates ────────────────────────────────────────

    def _update_status_bar(self) -> None:
        """Refresh the status bar with current metrics."""
        try:
            status_bar = self.query_one("#status-bar", StatusBar)
            status_bar.online_models = global_config.online_model_count
            status_bar.token_usage = global_config.token_usage
            status_bar.background_tasks = global_config.background_tasks
        except NoMatches:
            pass

    def _focus_active_panel_input(self) -> None:
        """Focus the input area of the first panel in the active workspace."""
        try:
            tabs = self.query_one(TabbedContent)
            active = tabs.active
            if active is None:
                return
            pane = tabs.get_pane(active)
            wsv = pane.query_one(WorkspaceView)
            if wsv.panels:
                wsv.panels[0].focus_input()
        except (NoMatches, IndexError):
            pass

    # ── Periodic refresh ──────────────────────────────────────────

    def set_interval_refresh(self, interval: float = 5.0) -> None:
        """Set up periodic status bar updates."""
        self.set_interval(interval, self._update_status_bar)

    # ── Event handlers ────────────────────────────────────────────

    def on_ai_window_panel_send_requested(
        self, message: AIWindowPanel.SendRequested
    ) -> None:
        """Handle a send request from any AIWindowPanel.
        
        Routes the message to the appropriate LLM provider via the
        providers module.
        """
        panel = message.panel
        user_text = message.text
        model_key = panel.model_name

        if not model_key:
            panel.add_message("system", "Please select a model first.")
            return

        # Get model and system prompt from config
        system_prompt = "You are a helpful AI assistant. Respond concisely and accurately."
        
        async def do_send():
            panel.status = "thinking"
            try:
                result = await send_message(
                    model_name=model_key,
                    messages=[{"role": "user", "content": user_text}],
                    system_prompt=system_prompt,
                    provider_manager=self._provider_mgr,
                    stream=False,
                )
                if "error" in result:
                    panel.add_message("system", f"Error: {result['error']}")
                else:
                    content = result.get("content", "")
                    panel.add_message("assistant", content)
            except Exception as e:
                panel.add_message("system", f"Error: {str(e)}")
            finally:
                panel.status = "idle"
                self._update_status_bar()

        asyncio.create_task(do_send())

    def on_ai_window_panel_model_changed(
        self, message: AIWindowPanel.ModelChanged
    ) -> None:
        """Handle model selection changes."""
        panel_name = message.panel.id or "unknown"
        self.notify(
            f"Model switched to: {message.model_name}",
            title=f"Panel: {panel_name}",
            timeout=3,
        )

    def on_tabbed_content_tab_activated(self, event: TabbedContent.TabActivated) -> None:
        """Focus the input when switching tabs."""
        self.call_after_refresh(self._focus_active_panel_input)


# ── Entry point ────────────────────────────────────────────────────────────────


def main() -> None:
    """Run the TermWorkspace application."""
    app = TermWorkspaceApp()
    app.run()


if __name__ == "__main__":
    main()
