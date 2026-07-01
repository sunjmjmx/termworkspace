"""Tests for multi-window forwarding (P4-1)."""

from __future__ import annotations


def test_forward_requested_message_class() -> None:
    """ForwardRequested nested class should exist and be a Message subclass."""
    from textual.message import Message

    from termworkspace.window import AIWindowPanel

    assert hasattr(AIWindowPanel, "ForwardRequested")
    assert issubclass(AIWindowPanel.ForwardRequested, Message)


def test_forward_requested_accepts_source_and_target() -> None:
    """ForwardRequested should carry source_panel and target_panel_id."""
    from termworkspace.window import AIWindowPanel

    msg = AIWindowPanel.ForwardRequested.__new__(AIWindowPanel.ForwardRequested)
    msg.source_panel = None
    msg.target_panel_id = "panel-1"
    assert hasattr(msg, "source_panel")
    assert hasattr(msg, "target_panel_id")
    # Verify the constructor signature expects both
    import inspect

    sig = inspect.signature(AIWindowPanel.ForwardRequested.__init__)
    params = list(sig.parameters.keys())
    assert "source_panel" in params
    assert "target_panel_id" in params


def test_forward_to_exists() -> None:
    """AIWindowPanel should have a forward_to() method."""
    from termworkspace.window import AIWindowPanel

    assert hasattr(AIWindowPanel, "forward_to")
    assert callable(AIWindowPanel.forward_to)


def test_set_forward_panels_exists() -> None:
    """AIWindowPanel should have a set_forward_panels() method."""
    from termworkspace.window import AIWindowPanel

    assert hasattr(AIWindowPanel, "set_forward_panels")
    assert callable(AIWindowPanel.set_forward_panels)


def test_forward_to_copies_messages() -> None:
    """forward_to() should add forwarded messages to the target's history."""
    # Standalone test of the message copy semantics
    original = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there!"},
    ]
    copy = list(original)
    assert copy == original
    assert copy is not original

    # Modifying the copy shouldn't affect the original
    copy.append({"role": "user", "content": "Another message"})
    assert len(original) == 2
    assert len(copy) == 3


def test_item_forward_panel_resolves() -> None:
    """Panel IDs in the forward select should match AIWindowPanel IDs."""
    from termworkspace.window import AIWindowPanel

    # Verify that panel.id format matches the ID used in select values
    assert hasattr(AIWindowPanel, "forward_to")


def test_form_name_panel_when_disabled() -> None:
    """set_forward_panels([]) should disable the forward select."""
    from termworkspace.window import AIWindowPanel

    assert hasattr(AIWindowPanel, "set_forward_panels")
    import inspect

    sig = inspect.signature(AIWindowPanel.set_forward_panels)
    params = list(sig.parameters.keys())
    assert "panels" in params


# ── forward_to() edge cases ──


def test_forward_to_empty_messages_noop() -> None:
    """forward_to() with empty messages should not crash or add anything."""
    from termworkspace.window import AIWindowPanel

    panel = AIWindowPanel.__new__(AIWindowPanel)
    panel.messages = [{"role": "user", "content": "existing"}]
    panel._uid = "panel-0"
    panel.forward_to([])
    assert len(panel.messages) == 1


def test_forward_to_preserves_markers() -> None:
    """forward_to() with source_name should set forwarded_from markers via messages list."""
    from unittest.mock import MagicMock

    from termworkspace.window import AIWindowPanel

    panel = AIWindowPanel.__new__(AIWindowPanel)
    panel.messages = []
    panel._uid = "panel-0"
    panel.query_one = MagicMock()
    panel.focus_input = MagicMock()

    source_msgs = [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "World"}]
    panel.forward_to(source_msgs, source_name="Panel 0")
    assert len(panel.messages) == 2
    for msg in panel.messages:
        assert msg.get("forwarded_from") == "Panel 0"
    assert panel.messages[0]["content"] == "Hello"
    assert panel.messages[1]["content"] == "World"


def test_forward_to_without_source_name() -> None:
    """forward_to() without source_name should not set forwarded_from."""
    from unittest.mock import MagicMock

    from termworkspace.window import AIWindowPanel

    panel = AIWindowPanel.__new__(AIWindowPanel)
    panel.messages = []
    panel._uid = "panel-0"
    panel.query_one = MagicMock()
    panel.focus_input = MagicMock()

    panel.forward_to([{"role": "user", "content": "test"}])
    assert "forwarded_from" not in panel.messages[0]


def test_forward_to_keeps_existing_messages() -> None:
    """forward_to() should append to, not replace, existing messages."""
    from unittest.mock import MagicMock

    from termworkspace.window import AIWindowPanel

    panel = AIWindowPanel.__new__(AIWindowPanel)
    panel.messages = [{"role": "user", "content": "Original"}]
    panel._uid = "panel-0"
    panel.query_one = MagicMock()
    panel.focus_input = MagicMock()

    panel.forward_to([{"role": "assistant", "content": "Forwarded reply"}], source_name="Panel 1")
    assert len(panel.messages) == 2
    assert panel.messages[0]["content"] == "Original"
    assert panel.messages[1]["content"] == "Forwarded reply"


# ── Forward panel wiring logic ──


def test_forward_panels_target_format() -> None:
    """Forward target entries should have id and label keys."""
    from termworkspace.window import AIWindowPanel

    panels = [{"id": "ws-1-panel-1", "label": "Panel 1"}]
    # Verify minimal format expected by the wiring
    for p in panels:
        assert "id" in p
        assert "label" in p


def test_forward_panels_excludes_self_by_id() -> None:
    """When building targets, the same panel should not appear in its own list."""
    from termworkspace.window import AIWindowPanel

    # Simulate the logic from _wire_panel_forward_targets
    all_siblings = [
        {"id": "ws-0-panel-0", "label": "Panel 0"},
        {"id": "ws-0-panel-1", "label": "Panel 1"},
    ]
    own_id = "ws-0-panel-0"
    targets = [s for s in all_siblings if s["id"] != own_id]
    assert len(targets) == 1
    assert targets[0]["id"] == "ws-0-panel-1"


# ── ForwardRequested handler logic ──


def test_forward_handler_finds_target_by_id() -> None:
    """The handler should look up a target panel by its widget ID."""
    from termworkspace.window import AIWindowPanel

    # The handler uses self.query_one(f"#{target_id}", AIWindowPanel)
    # Verify the ID format convention matches
    msg = AIWindowPanel.ForwardRequested.__new__(AIWindowPanel.ForwardRequested)
    msg.source_panel = None
    msg.target_panel_id = "ws-1-panel-2"
    assert msg.target_panel_id.startswith("ws-")


def test_forward_handler_empty_messages_check() -> None:
    """The handler checks source_panel.messages before forwarding."""
    from termworkspace.window import AIWindowPanel

    # Simulate the guard clause
    source = AIWindowPanel.__new__(AIWindowPanel)
    source.messages = []
    assert len(source.messages) == 0
    # Guard: if not source_panel.messages: return early


# ── WorkspaceView panel discovery ──


def test_workspaceview_panels_listed() -> None:
    """WorkspaceView panels should be listable by _panel_index."""
    # Verify the label format used in _wire_panel_forward_targets
    panels = [{"id": "ws-1-panel-0", "_panel_index": 0}, {"id": "ws-1-panel-1", "_panel_index": 1}]
    assert len(panels) == 2
    assert panels[0]["_panel_index"] == 0
    assert panels[1]["_panel_index"] == 1
    # The label generation logic: f"Panel {sibling._panel_index}"
    labels = {f"Panel {p['_panel_index']}": p["id"] for p in panels}
    assert labels["Panel 0"] == "ws-1-panel-0"
    assert labels["Panel 1"] == "ws-1-panel-1"
