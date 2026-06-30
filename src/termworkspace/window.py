"""AI conversation window panel for TermWorkspace."""

from __future__ import annotations

import logging

from textual.binding import Binding

logger = logging.getLogger(__name__)
from textual.containers import Horizontal, Vertical
from textual.message import Message
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Button, Label, Select, TextArea


from typing import Any, Callable, Optional


class AIWindowPanel(Widget):
    """A single AI conversation panel with history, input, and model controls.

    Each panel has independent state:
      - model_name: currently bound model
      - messages: list of dicts with role/content
      - status: idle | thinking | error
    """

    DEFAULT_CSS = """
    AIWindowPanel {
        border: solid $primary;
        height: 100%;
        width: 100%;
        padding: 0;
        margin: 0;
    }

    AIWindowPanel > Vertical {
        height: 100%;
        padding: 0 1 1 1;
    }

    .window-header {
        height: 3;
        min-height: 3;
        background: $panel;
        border-bottom: solid $border;
        padding: 0 1;
        align: center middle;
    }

    .model-select {
        width: 1fr;
        margin-right: 1;
    }

    .model-status-label {
        width: auto;
        min-width: 10;
        margin: 0 1;
        text-align: center;
        text-style: bold;
    }

    .model-status-label.online {
        color: $success;
    }

    .model-status-label.offline {
        color: $error;
    }

    .model-status-label.thinking {
        color: $warning;
    }

    .clear-btn {
        width: auto;
        min-width: 8;
        margin-left: 1;
    }

    .conversation-history {
        height: 1fr;
        border: solid $border;
        margin: 1 0;
        padding: 1;
    }

    .input-area {
        height: 5;
        min-height: 5;
        border: solid $border;
        margin: 0;
        padding: 1;
    }
    """

    BINDINGS = [
        Binding("ctrl+enter", "send_message", "Send", priority=True),
    ]

    model_name: reactive[str] = reactive("")
    status: reactive[str] = reactive("idle")

    class SendRequested(Message):
        """Posted when the user presses Ctrl+Enter to send a message."""

        def __init__(self, panel: AIWindowPanel, text: str) -> None:
            super().__init__()
            self.panel = panel
            self.text = text

    class ModelChanged(Message):
        """Posted when the user selects a different model."""

        def __init__(self, panel: AIWindowPanel, model_name: str) -> None:
            super().__init__()
            self.panel = panel
            self.model_name = model_name

    class ConversationCleared(Message):
        """Posted when the user clears the conversation."""

        def __init__(self, panel: AIWindowPanel) -> None:
            super().__init__()
            self.panel = panel

    def __init__(
        self,
        model_name: str = "",
        available_models: list[str] | None = None,
        *,
        panel_index: int = 0,
        workspace_name: str = "",
        tab_name: str = "",
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._panel_index = panel_index
        self.model_name = model_name
        self._available_models = available_models or [
            "gpt-4",
            "claude-3-opus",
            "llama-3-70b",
            "gemini-pro",
            "deepseek-v3",
        ]
        self.messages: list[dict] = []
        self._uid = f"panel-{panel_index}"
        self._workspace_name = workspace_name
        self._tab_name = tab_name
        self._save_callback: Callable[[str, str, str], None] | None = None
        self._clear_callback: Callable[[], None] | None = None
        self._stream_buffer: list[str] = []

    # ── Session persistence properties ──

    @property
    def ws_name(self) -> str:
        """Workspace name for storage scoping."""
        return self._workspace_name

    @property
    def tab_name(self) -> str:
        """Tab name for storage scoping."""
        return self._tab_name

    def compose(self):
        with Vertical():
            # ── Header: model select + status + clear ──
            with Horizontal(classes="window-header"):
                yield Select(
                    [(m, m) for m in self._available_models],
                    prompt="Select model...",
                    value=self.model_name if self.model_name else None,
                    id=f"{self._uid}-model-select",
                    classes="model-select",
                )
                yield Label(
                    "● idle",
                    id=f"{self._uid}-status",
                    classes="model-status-label online",
                )
                yield Button("✕ Clear", id=f"{self._uid}-clear", variant="error", classes="clear-btn")

            # ── Conversation history (read-only) ──
            yield TextArea(
                "",
                id=f"{self._uid}-history",
                read_only=True,
                classes="conversation-history",
                show_line_numbers=False,
            )

            # ── Input area ──
            yield TextArea(
                "",
                id=f"{self._uid}-input",
                classes="input-area",
                show_line_numbers=False,
            )

    def on_mount(self) -> None:
        """Post-mount setup: wire up keyboard focus and initial scroll."""
        self.watch_model_name(self.model_name)
        self.watch_status(self.status)

    # ── Reactive watchers ──

    def watch_model_name(self, new_name: str) -> None:
        """Update the model selector when model_name changes."""
        if not new_name:
            return
        select = self.query_one(f"#{self._uid}-model-select", Select)
        if new_name in [v for _, v in select._options]:
            try:
                select.value = new_name
            except Exception:
                pass

    def watch_status(self, new_status: str) -> None:
        """Update the status label when status changes."""
        label = self.query_one(f"#{self._uid}-status", Label)
        label.update(f"● {new_status}")
        # Reset then apply the correct CSS class
        label.remove_class("online", "offline", "thinking")
        if new_status in ("idle",):
            label.add_class("online")
        elif new_status == "thinking":
            label.add_class("thinking")
        else:
            label.add_class("offline")

    # ── Event handlers ──

    def on_select_changed(self, event: Select.Changed) -> None:
        """Handle model selection changes."""
        if event.select.id == f"{self._uid}-model-select" and event.value:
            old_name = self.model_name
            self.model_name = event.value
            if old_name != event.value:
                self.post_message(self.ModelChanged(self, event.value))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == f"{self._uid}-clear":
            self.clear_conversation()

    # ── Actions ──

    def action_send_message(self) -> None:
        """Send the current input as a user message (Ctrl+Enter)."""
        input_area = self.query_one(f"#{self._uid}-input", TextArea)
        message = input_area.text.strip()
        if not message:
            return
        self.add_message("user", message)
        input_area.text = ""
        self.post_message(self.SendRequested(self, message))

    # ── Public API ──

    def add_message(self, role: str, content: str) -> None:
        """Append a message to the conversation and update the display.

        Automatically persists to SQLite if a save callback is registered.
        """
        self.messages.append({"role": role, "content": content})
        history = self.query_one(f"#{self._uid}-history", TextArea)
        prefix = f"\n\n── {role} ──\n" if len(self.messages) > 1 else f"── {role} ──\n"
        history.text += f"{prefix}{content}"
        history.scroll_end(animate=False)

        # Auto-save user/assistant messages to storage
        if self._save_callback and role in ("user", "assistant"):
            self._save_callback(role, content, self.model_name or "")

    def clear_conversation(self) -> None:
        """Clear the conversation history and notify storage."""
        self.messages.clear()
        history = self.query_one(f"#{self._uid}-history", TextArea)
        history.text = ""
        if self._clear_callback:
            self._clear_callback()
        self.post_message(self.ConversationCleared(self))

    def update_available_models(self, models: list[str]) -> None:
        """Refresh the model dropdown with a new list of available models."""
        self._available_models = models
        select = self.query_one(f"#{self._uid}-model-select", Select)
        select.set_options([(m, m) for m in models])

    def focus_input(self) -> None:
        """Focus the input text area."""
        input_area = self.query_one(f"#{self._uid}-input", TextArea)
        input_area.focus()

    # ── Session persistence API ──

    def set_storage_callbacks(
        self,
        *,
        on_save: Callable[[str, str, str], None] | None = None,
        on_clear: Callable[[], None] | None = None,
    ) -> None:
        """Register save/clear callbacks from the app layer.

        The *on_save* callback receives (role, content, model).
        The *on_clear* callback receives no arguments.
        """
        self._save_callback = on_save
        self._clear_callback = on_clear

    def load_messages(self, msgs: list[dict[str, Any]]) -> None:
        """Replace panel messages with history loaded from storage."""
        self.messages = [{"role": m["role"], "content": m["content"]} for m in msgs]
        history = self.query_one(f"#{self._uid}-history", TextArea)
        parts = [f"── {m['role']} ──\n{m['content']}" for m in msgs]
        history.text = "\n\n".join(parts)
        if msgs:
            history.scroll_end(animate=False)

    # ── Streaming API (called from app.py) ──

    def stream_chunk(self, content: str) -> None:
        """Append a streaming text chunk to the assistant response buffer."""
        self._stream_buffer.append(content)

    def stream_end(self) -> None:
        """Finalise streaming: flush the buffer as a complete assistant message."""
        full = "".join(self._stream_buffer)
        self._stream_buffer.clear()
        if full:
            self.add_message("assistant", full)

    def stream_error(self, error_msg: str) -> None:
        """Handle a streaming error — flush buffer and show error."""
        self._stream_buffer.clear()
        self.add_message("system", error_msg)
