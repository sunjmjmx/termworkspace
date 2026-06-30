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

    def __init__(
        self,
        model_name: str = "",
        available_models: list[str] | None = None,
        *,
        panel_index: int = 0,
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
        """Append a message to the conversation and update the display."""
        self.messages.append({"role": role, "content": content})
        history = self.query_one(f"#{self._uid}-history", TextArea)
        prefix = f"\n\n── {role} ──\n" if len(self.messages) > 1 else f"── {role} ──\n"
        history.text += f"{prefix}{content}"
        # Scroll to the bottom
        history.scroll_end(animate=False)

    def clear_conversation(self) -> None:
        """Clear the conversation history."""
        self.messages.clear()
        history = self.query_one(f"#{self._uid}-history", TextArea)
        history.text = ""

    def update_available_models(self, models: list[str]) -> None:
        """Refresh the model dropdown with a new list of available models."""
        self._available_models = models
        select = self.query_one(f"#{self._uid}-model-select", Select)
        select.set_options([(m, m) for m in models])

    def focus_input(self) -> None:
        """Focus the input text area."""
        input_area = self.query_one(f"#{self._uid}-input", TextArea)
        input_area.focus()
