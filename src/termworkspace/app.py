# -*- coding: utf-8 -*-
"""TermWorkspace — A terminal-based AI workspace with split-panel conversations.

Entry point (after pip install)::
    termworkspace

Or::
    python3 -m termworkspace

Keyboard shortcuts:
  Ctrl+T  → New tab
  Ctrl+W  → Close current tab
  Ctrl+Q  → Quit
"""

from __future__ import annotations
import asyncio
import logging
import os
import sys
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import Button, Footer, Header, Input, Label, Static, TabbedContent, TabPane

from .window import AIWindowPanel
from .workspace import WorkspaceView, WorkspaceManager, global_config
from .providers import ProviderManager as RealProviderManager
from .providers import send_message
from .config import ConfigManager
from .storage import StorageManager


# ── File Path Prompt Screen ──────────────────────────────────────────────────


class FilePromptScreen(ModalScreen[str | None]):
    """Modal screen that asks the user for a file path.

    Returns the path string on submit, or ``None`` if cancelled.
    """

    DEFAULT_CSS = """
    FilePromptScreen {
        align: center middle;
    }

    FilePromptScreen > Vertical {
        width: 60;
        height: auto;
        padding: 2;
        background: $surface;
        border: thick $primary;
    }

    FilePromptScreen Label {
        text-style: bold;
        margin-bottom: 1;
    }

    FilePromptScreen Input {
        margin-bottom: 1;
    }

    FilePromptScreen Horizontal {
        height: auto;
        align: right middle;
    }

    FilePromptScreen Button {
        margin-left: 1;
    }
    """

    def __init__(
        self,
        title: str = "File Path",
        placeholder: str = "/path/to/file.yaml",
        default: str = "",
        ok_label: str = "Confirm",
    ) -> None:
        super().__init__()
        self._prompt_title = title
        self._placeholder = placeholder
        self._default = default
        self._ok_label = ok_label

    def compose(self) -> ComposeResult:
        yield Vertical(
            Label(self._prompt_title),
            Input(
                placeholder=self._placeholder,
                value=self._default,
                id="file-path-input",
            ),
            Horizontal(
                Button("Cancel", id="cancel-btn", variant="error"),
                Button(self._ok_label, id="ok-btn", variant="primary"),
            ),
        )

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.dismiss(event.value.strip())

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cancel-btn":
            self.dismiss(None)
        elif event.button.id == "ok-btn":
            inp = self.query_one("#file-path-input", Input)
            self.dismiss(inp.value.strip())


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
    """TermWorkspace - A terminal-based AI workspace application."""

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
        try:
            self._load_user_config()
        except Exception as exc:
            logger.warning("Failed to load user config: %s", exc)
            # App runs without config; user can configure via --init or ~/.termworkspace/config.yaml

    def _load_user_config(self) -> None:
        """Load user config from ~/.termworkspace/config.yaml."""
        config = self._config_mgr.load()
        if not config or "providers" not in config:
            logger.info("no provider config found — run with --init to set up")
            return

        self._provider_mgr.load_from_config(config["providers"])
        # Populate model list for workspace panels
        models = self._provider_mgr.get_available_models()
        global_config.providers.clear()
        for provider_name, model_name in models:
            from .workspace import ProviderConfig as WSProvider
            global_config.providers.append(
                WSProvider(name=provider_name, model=model_name, api_key="", base_url="", online=True)
            )
        global_config.available_models  # trigger property refresh

        # 验证至少有一个有效的 API key
        configured = {k: v for k, v in config.get("providers", {}).items() if v.get("api_key")}
        if not configured:
            logger.warning("config found but no API keys configured — run with --init")
        else:
            logger.info("loaded %d configured provider(s): %s", len(configured), list(configured.keys()))

    # ── Compose ───────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(initial="tab-0"):
            with TabPane("Workspace 1", id="tab-0"):
                ws_id = self._ws_manager.create_workspace("Workspace 1")
                yield WorkspaceView(layout="single", ws_id=ws_id, id=f"wsv-{ws_id}")
        yield StatusBar(id="status-bar")

    def on_mount(self) -> None:
        """Post-mount setup: init persistence, restore session, set callbacks."""
        self._tab_counter = 1
        self._update_status_bar()
        # Init DB — fire-and-forget so the UI renders immediately
        asyncio.create_task(self._post_mount_init())

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
        # Wire persistence on the new tab's panels (mount kicks in after refresh)
        self.call_after_refresh(self._wire_panels_on_next_refresh)

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

    # ── Session Persistence ──────────────────────────────────────────

    async def _post_mount_init(self) -> None:
        """Init DB, restore session history, wire persistence callbacks.

        Runs once after mount so the UI renders before blocking on I/O.
        """
        await StorageManager.init_db()
        await self._restore_and_wire_all_panels()
        self._focus_active_panel_input()

    async def _restore_and_wire_all_panels(self) -> None:
        """Load history from DB into every panel and wire save/clear callbacks."""
        for panel in self.query(AIWindowPanel):
            await self._restore_one_panel(panel)
            self._wire_one_panel(panel)

    async def _restore_one_panel(self, panel: AIWindowPanel) -> None:
        """Load conversation history from DB into a single panel."""
        msgs = await StorageManager.get_history(
            panel.ws_name, panel.tab_name, panel._uid
        )
        if msgs:
            panel.load_messages(msgs)

    def _wire_one_panel(self, panel: AIWindowPanel) -> None:
        """Attach save/clear callbacks to a single panel."""
        ws_name = panel.ws_name
        tab_name = panel.tab_name
        window_id = panel._uid

        def on_save(role: str, content: str, model: str) -> None:
            asyncio.create_task(
                StorageManager.save_message(
                    ws_name, tab_name, window_id, role, content, model
                )
            )

        def on_clear() -> None:
            asyncio.create_task(
                StorageManager.clear_history(ws_name, tab_name, window_id)
            )

        panel.set_storage_callbacks(on_save=on_save, on_clear=on_clear)

    def _wire_panels_on_next_refresh(self) -> None:
        """Wire any panels that aren't yet wired (e.g. new tab panels)."""
        for panel in self.query(AIWindowPanel):
            if panel._save_callback is None:
                self._wire_one_panel(panel)

    # ── Workspace Export / Import ──────────────────────────────────

    def action_export_workspace(self) -> None:
        """Export current workspace configuration to a YAML file (Ctrl+Shift+E)."""
        default_path = f"~/termworkspace-export-{self._tab_counter}.yaml"

        def handle_export(path: str | None) -> None:
            if not path:
                return
            try:
                resolved = self._ws_manager.export_to_yaml(path)
                self.notify(
                    f"Exported {len(self._ws_manager.list_workspaces())} workspace(s)"
                    f" to {resolved}",
                    title="Export Success",
                    timeout=5,
                )
            except Exception as exc:
                self.notify(
                    f"Export failed: {exc}",
                    title="Export Error",
                    severity="error",
                    timeout=5,
                )

        self.push_screen(
            FilePromptScreen(
                title="Export Workspace Config",
                placeholder="~/termworkspace-export.yaml",
                default=default_path,
                ok_label="Export",
            ),
            handle_export,
        )

    def action_import_workspace(self) -> None:
        """Import workspace configuration from a YAML file (Ctrl+Shift+I)."""

        def handle_import(path: str | None) -> None:
            if not path:
                return
            try:
                count = self._ws_manager.import_from_yaml(path, replace=False)
                self.notify(
                    f"Imported {count} workspace(s) from {path}",
                    title="Import Success",
                    timeout=5,
                )
                # Refresh all WorkspaceView widgets with the new model list
                for pane in self.query(TabPane):
                    try:
                        wsv = pane.query_one(WorkspaceView)
                        wsv.refresh_available_models()
                    except NoMatches:
                        pass
                self._update_status_bar()
            except FileNotFoundError:
                self.notify(
                    f"File not found: {path}",
                    title="Import Error",
                    severity="error",
                    timeout=5,
                )
            except Exception as exc:
                self.notify(
                    f"Import failed: {exc}",
                    title="Import Error",
                    severity="error",
                    timeout=5,
                )

        # Look in project's docs/templates/ for suggestions
        project_templates = Path(__file__).resolve().parent.parent.parent / "docs" / "templates"
        default_path = str(project_templates / "general-writing.yaml") if project_templates.is_dir() else ""

        self.push_screen(
            FilePromptScreen(
                title="Import Workspace from YAML",
                placeholder="/path/to/template.yaml",
                default=default_path,
                ok_label="Import",
            ),
            handle_import,
        )

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
                generator = await send_message(
                    model_name=model_key,
                    messages=[{"role": "user", "content": user_text}],
                    system_prompt=system_prompt,
                    provider_manager=self._provider_mgr,
                    stream=True,
                )
                async for chunk in generator:
                    if chunk.get("done"):
                        panel.stream_end()
                    elif chunk.get("error"):
                        panel.stream_error(chunk.get("content", ""))
                    else:
                        content = chunk.get("content", "")
                        if content:
                            panel.stream_chunk(content)
            except ValueError as e:
                # 配置缺失（无 API key / base URL / 模型名）
                logger.warning("send_message config error: %s", e)
                panel.stream_error(str(e))
            except aiohttp.ClientError as e:
                # 网络连接失败
                logger.error("send_message network error: %s", e)
                panel.stream_error(f"网络连接失败: {e}")
            except asyncio.TimeoutError:
                logger.error("send_message timeout")
                panel.stream_error("请求超时，请检查网络连接")
            except Exception as e:
                logger.exception("send_message unexpected error")
                panel.stream_error(f"未知错误: {e}")
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

    def on_ai_window_panel_conversation_cleared(
        self, message: AIWindowPanel.ConversationCleared
    ) -> None:
        """Handle a clear-conversation request from any panel.
        
        Clears persisted messages from storage as well.
        """
        panel = message.panel
        asyncio.create_task(self._clear_storage(panel))

    def on_tabbed_content_tab_activated(self, event: TabbedContent.TabActivated) -> None:
        """Focus the input when switching tabs."""
        self.call_after_refresh(self._focus_active_panel_input)


# ── Entry point ────────────────────────────────────────────────────────────────


def main() -> None:
    "Run the TermWorkspace application."
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    import argparse

    parser = argparse.ArgumentParser(
        prog="termworkspace",
        description="TermWorkspace - Terminal-native multi-model AI workspace",
        epilog=(
            "Keyboard shortcuts inside the app:\n"
            "  Ctrl+T  New workspace tab\n"
            "  Ctrl+W  Close current tab\n"
            "  Ctrl+Q  Quit"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--version",
        action="version",
        version="termworkspace 0.1.0",
        help="show version and exit",
    )
    parser.add_argument(
        "-c", "--config",
        metavar="PATH",
        help="path to config YAML (default: ~/.termworkspace/config.yaml)",
    )
    parser.add_argument(
        "--theme",
        choices=["dark", "light"],
        default=None,
        help="override theme (default: from config or dark)",
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="run the initial setup wizard and exit",
    )

    args = parser.parse_args()

    if args.init:
        from .config import ConfigManager
        config = ConfigManager.init_wizard()
        if config:
            print("Configuration complete. Run 'termworkspace' to start.")
        return

    if args.config:
        os.environ["TERMWORKSPACE_CONFIG"] = args.config

    # 自动启动配置向导（如果没有配置文件）
    from .config import ConfigManager as _CM
    if not _CM.exists():
        print()
        print("~" * 50)
        print("  检测到首次运行：未找到配置文件")
        print("  将启动配置向导引导您设置 API Key")
        print("~" * 50)
        print()
        _CM.init_wizard()

    app = TermWorkspaceApp()
    app.run()


if __name__ == "__main__":
    main()
