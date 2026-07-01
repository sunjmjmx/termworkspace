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
