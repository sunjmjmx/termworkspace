"""Tests for StorageManager — SQLite persistence."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_init_db_creates_tables(temp_db_dir: Path) -> None:
    """init_db() should create the conversations + workspaces tables."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    db_path = StorageManager.DB_PATH
    assert db_path.is_file(), "DB file should exist after init_db"

    # Verify tables exist by inspecting schema
    import aiosqlite

    async with aiosqlite.connect(str(db_path)) as conn:
        cursor = await conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in await cursor.fetchall()]
        await cursor.close()

    assert "conversations" in tables
    assert "workspaces" in tables


@pytest.mark.asyncio
async def test_save_and_get_message(temp_db_dir: Path) -> None:
    """A saved message should be retrievable via get_history()."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    msg_id = await StorageManager.save_message(
        workspace="test_ws",
        tab="tab1",
        window_id="panel-0",
        role="user",
        content="Hello, world!",
        model="deepseek-chat",
    )
    assert msg_id > 0, "Should return a valid message ID"

    history = await StorageManager.get_history("test_ws", "tab1", "panel-0")
    assert len(history) == 1
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hello, world!"
    assert history[0]["model"] == "deepseek-chat"


@pytest.mark.asyncio
async def test_get_history_empty(temp_db_dir: Path) -> None:
    """get_history() should return [] for a window with no messages."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    history = await StorageManager.get_history("nonexistent", "tab", "panel")
    assert history == []


@pytest.mark.asyncio
async def test_save_multiple_messages(temp_db_dir: Path) -> None:
    """Multiple saved messages should come back in order."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    for i in range(5):
        await StorageManager.save_message(
            workspace="ws1",
            tab="tab1",
            window_id="panel-0",
            role="user" if i % 2 == 0 else "assistant",
            content=f"Message {i}",
            model="gpt-4",
        )

    history = await StorageManager.get_history("ws1", "tab1", "panel-0")
    assert len(history) == 5
    assert [h["content"] for h in history] == [f"Message {i}" for i in range(5)]


@pytest.mark.asyncio
async def test_get_history_limit(temp_db_dir: Path) -> None:
    """get_history() should respect the limit parameter."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    for i in range(10):
        await StorageManager.save_message(
            workspace="ws",
            tab="t",
            window_id="p",
            role="user",
            content=f"msg{i}",
            model="test",
        )

    history = await StorageManager.get_history("ws", "t", "p", limit=3)
    assert len(history) == 3


@pytest.mark.asyncio
async def test_clear_history(temp_db_dir: Path) -> None:
    """clear_history() should remove all messages for the specified window."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    for i in range(3):
        await StorageManager.save_message(
            workspace="ws",
            tab="t",
            window_id="p",
            role="user",
            content=f"msg{i}",
            model="t",
        )

    deleted = await StorageManager.clear_history("ws", "t", "p")
    assert deleted == 3

    history = await StorageManager.get_history("ws", "t", "p")
    assert history == []


@pytest.mark.asyncio
async def test_clear_history_partial(temp_db_dir: Path) -> None:
    """Clearing one window should not affect another window's messages."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    await StorageManager.save_message("ws", "t", "panel-a", "user", "A", "t")
    await StorageManager.save_message("ws", "t", "panel-b", "user", "B", "t")

    deleted = await StorageManager.clear_history("ws", "t", "panel-a")
    assert deleted == 1

    history_b = await StorageManager.get_history("ws", "t", "panel-b")
    assert len(history_b) == 1
    assert history_b[0]["content"] == "B"


@pytest.mark.asyncio
async def test_clear_history_empty(temp_db_dir: Path) -> None:
    """Clearing a window with no messages should return 0."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()
    deleted = await StorageManager.clear_history("ws", "t", "nonexistent")
    assert deleted == 0


# ── Workspace config tests ──


@pytest.mark.asyncio
async def test_save_and_get_workspace_config(temp_db_dir: Path) -> None:
    """Workspace config should round-trip via JSON."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    config = {"name": "test_ws", "layout": "horizontal", "panes": [{"model": "gpt-4"}]}
    await StorageManager.save_workspace_config("test_ws", config)

    restored = await StorageManager.get_workspace_config("test_ws")
    assert restored is not None
    assert restored["name"] == "test_ws"
    assert restored["layout"] == "horizontal"


@pytest.mark.asyncio
async def test_get_workspace_config_nonexistent(temp_db_dir: Path) -> None:
    """get_workspace_config() should return None for a missing workspace."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    config = await StorageManager.get_workspace_config("nonexistent")
    assert config is None


@pytest.mark.asyncio
async def test_get_all_workspaces(temp_db_dir: Path) -> None:
    """get_all_workspaces() should return all saved workspaces."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    await StorageManager.save_workspace_config("ws1", {"name": "WS 1"})
    await StorageManager.save_workspace_config("ws2", {"name": "WS 2"})

    all_ws = await StorageManager.get_all_workspaces()
    assert len(all_ws) == 2
    names = [ws["name"] for ws in all_ws]
    assert "ws1" in names
    assert "ws2" in names


@pytest.mark.asyncio
async def test_delete_workspace(temp_db_dir: Path) -> None:
    """Deleting a workspace should remove its config and messages."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    await StorageManager.save_workspace_config("ws1", {"name": "WS 1"})
    await StorageManager.save_message(
        "ws1",
        "tab",
        "panel",
        "user",
        "test",
        "t",
    )

    deleted = await StorageManager.delete_workspace("ws1")
    assert deleted is True

    config = await StorageManager.get_workspace_config("ws1")
    assert config is None

    history = await StorageManager.get_history("ws1", "tab", "panel")
    assert history == []


@pytest.mark.asyncio
async def test_delete_workspace_nonexistent(temp_db_dir: Path) -> None:
    """Deleting a nonexistent workspace should return False."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    deleted = await StorageManager.delete_workspace("nonexistent")
    assert deleted is False


@pytest.mark.asyncio
async def test_get_stats(temp_db_dir: Path) -> None:
    """get_stats() should return accurate statistics."""
    from termworkspace.storage import StorageManager

    await StorageManager.init_db()

    await StorageManager.save_message("ws1", "t", "p", "user", "a", "m")
    await StorageManager.save_message("ws1", "t", "p", "assistant", "b", "m")
    await StorageManager.save_message("ws2", "t", "p", "user", "c", "m")

    stats = await StorageManager.get_stats()
    assert stats["total_messages"] == 3
    assert stats["total_workspaces"] == 0  # no workspace configs saved
    assert "ws1" in stats["messages_per_workspace"]
    assert stats["messages_per_workspace"]["ws1"] == 2
    assert stats["messages_per_workspace"]["ws2"] == 1
