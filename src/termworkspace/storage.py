"""
TermWorkspace — 对话历史持久化

StorageManager: 使用 SQLite 存储对话记录和 workspace 配置。
支持异步操作（优先 aiosqlite，fallback 到 sqlite3 + run_in_executor）。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 尝试导入异步 SQLite 驱动
# ──────────────────────────────────────────────

try:
    import aiosqlite

    HAS_AIOSQLITE = True
except ImportError:
    HAS_AIOSQLITE = False
    import asyncio
    import sqlite3
    from concurrent.futures import ThreadPoolExecutor

    _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="sqlite_worker")


# ──────────────────────────────────────────────
# StorageManager
# ──────────────────────────────────────────────


class StorageManager:
    """SQLite 持久化管理器，支持异步操作。"""

    DB_DIR = Path.home() / ".termworkspace"
    DB_PATH = DB_DIR / "data.db"

    # ── 路径保证 ──────────────────────────────

    @classmethod
    def ensure_dir(cls) -> None:
        """确保数据库目录存在。"""
        cls.DB_DIR.mkdir(parents=True, exist_ok=True)

    # ── 数据库初始化 ───────────────────────────

    @classmethod
    async def init_db(cls) -> None:
        """创建数据库表（如果不存在）。"""
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_name TEXT,
                    tab_name TEXT,
                    window_id TEXT,
                    role TEXT,
                    content TEXT,
                    model TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                    name TEXT PRIMARY KEY,
                    config TEXT
                )
                """
            )

            # 索引：按 workspace + tab + window 查询时加速
            try:
                await conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_conv_lookup
                    ON conversations (workspace_name, tab_name, window_id, timestamp)
                    """
                )
            except Exception:
                pass  # 兼容某些版本 CREATE INDEX IF NOT EXISTS 的差异

            await conn.commit()

        logger.info("database initialized at %s", cls.DB_PATH)

    # ── 保存消息 ──────────────────────────────

    @classmethod
    async def save_message(
        cls,
        workspace: str,
        tab: str,
        window_id: str,
        role: str,
        content: str,
        model: str,
    ) -> int:
        """保存一条对话消息到数据库。

        Args:
            workspace: 工作区名称
            tab: 标签页名称
            window_id: 窗口标识
            role: 'user' / 'assistant' / 'system'
            content: 消息内容
            model: 使用的模型

        Returns:
            新插入记录的 id
        """
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            last_id = await conn.execute(
                """
                INSERT INTO conversations
                    (workspace_name, tab_name, window_id, role, content, model)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (workspace, tab, window_id, role, content, model),
            )
            await conn.commit()
            return last_id

    # ── 获取历史 ──────────────────────────────

    @classmethod
    async def get_history(
        cls,
        workspace: str,
        tab: str,
        window_id: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """获取指定窗口的对话历史。

        Args:
            workspace: 工作区名称
            tab: 标签页名称
            window_id: 窗口标识
            limit: 返回的最大条数（默认 200，按时间正序取最新）

        Returns:
            消息列表，每条包含 id, workspace_name, tab_name, window_id,
            role, content, model, timestamp
        """
        cls.ensure_dir()

        columns = [
            "id",
            "workspace_name",
            "tab_name",
            "window_id",
            "role",
            "content",
            "model",
            "timestamp",
        ]

        async with cls._get_connection() as conn:
            rows = await conn.execute(
                """
                SELECT id, workspace_name, tab_name, window_id,
                       role, content, model, timestamp
                FROM conversations
                WHERE workspace_name = ?
                  AND tab_name = ?
                  AND window_id = ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (workspace, tab, window_id, limit),
                fetch=True,
            )

        return [dict(zip(columns, row)) for row in rows]

    # ── 清除历史 ──────────────────────────────

    @classmethod
    async def clear_history(
        cls,
        workspace: str,
        tab: str,
        window_id: str,
    ) -> int:
        """清除指定窗口的对话历史。

        Returns:
            删除的记录数
        """
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            deleted = await conn.execute(
                """
                DELETE FROM conversations
                WHERE workspace_name = ?
                  AND tab_name = ?
                  AND window_id = ?
                """,
                (workspace, tab, window_id),
                rowcount=True,
            )
            await conn.commit()

        logger.info("cleared %d messages for %s/%s/%s", deleted, workspace, tab, window_id)
        return deleted

    # ── Workspace 配置 ────────────────────────

    @classmethod
    async def save_workspace_config(cls, name: str, config_dict: dict[str, Any]) -> None:
        """保存 workspace 配置（以 JSON 格式）。"""
        cls.ensure_dir()
        config_json = json.dumps(config_dict, ensure_ascii=False, indent=2)

        async with cls._get_connection() as conn:
            await conn.execute(
                """
                INSERT OR REPLACE INTO workspaces (name, config)
                VALUES (?, ?)
                """,
                (name, config_json),
            )
            await conn.commit()

        logger.info("workspace config saved: %s", name)

    @classmethod
    async def get_workspace_config(cls, name: str) -> dict[str, Any] | None:
        """获取单个 workspace 配置。"""
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            rows = await conn.execute(
                "SELECT config FROM workspaces WHERE name = ?",
                (name,),
                fetch=True,
            )

        if not rows:
            return None

        try:
            return json.loads(rows[0][0])
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error("invalid workspace config JSON for '%s': %s", name, exc)
            return None

    @classmethod
    async def get_all_workspaces(cls) -> list[dict[str, Any]]:
        """获取所有 workspace 及其配置。"""
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            rows = await conn.execute(
                "SELECT name, config FROM workspaces",
                fetch=True,
            )

        result: list[dict[str, Any]] = []
        for name, config_json in rows:
            try:
                config = json.loads(config_json) if config_json else {}
            except json.JSONDecodeError:
                config = {}
            result.append({"name": name, "config": config})

        return result

    @classmethod
    async def delete_workspace(cls, name: str) -> bool:
        """删除 workspace 配置及其关联的所有对话历史。

        Returns:
            True 如果记录存在并删除，False 如果不存在。
        """
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            del_messages = await conn.execute(
                "DELETE FROM conversations WHERE workspace_name = ?",
                (name,),
                rowcount=True,
            )
            del_workspace = await conn.execute(
                "DELETE FROM workspaces WHERE name = ?",
                (name,),
                rowcount=True,
            )
            await conn.commit()

        logger.info(
            "deleted workspace '%s': %d messages, %d config entries",
            name,
            del_messages,
            del_workspace,
        )
        return del_workspace > 0

    # ── 数据库统计 ────────────────────────────

    @classmethod
    async def get_stats(cls) -> dict[str, Any]:
        """获取数据库统计信息。"""
        cls.ensure_dir()

        async with cls._get_connection() as conn:
            total_messages = await conn.execute(
                "SELECT COUNT(*) FROM conversations", fetch_scalar=True
            )
            total_workspaces = await conn.execute(
                "SELECT COUNT(*) FROM workspaces", fetch_scalar=True
            )
            per_workspace_rows = await conn.execute(
                "SELECT workspace_name, COUNT(*) FROM conversations GROUP BY workspace_name",
                fetch=True,
            )

        per_workspace = dict(per_workspace_rows)

        return {
            "total_messages": total_messages,
            "total_workspaces": total_workspaces,
            "messages_per_workspace": per_workspace,
            "db_path": str(cls.DB_PATH),
            "db_size_bytes": cls.DB_PATH.stat().st_size if cls.DB_PATH.is_file() else 0,
        }

    # ── 连接管理 ──────────────────────────────

    @classmethod
    def _get_connection(cls):
        """返回适合当前环境的异步数据库连接上下文管理器。

        优先 aiosqlite，fallback 到 sqlite3 + run_in_executor 包装。
        """
        cls.ensure_dir()
        if HAS_AIOSQLITE:
            return _AiosqliteConnection(cls.DB_PATH)
        else:
            return _SyncSqliteConnection(cls.DB_PATH)


# ──────────────────────────────────────────────
# 异步连接适配器
# ──────────────────────────────────────────────


class _AiosqliteConnection:
    """aiosqlite 异步连接包装。"""

    def __init__(self, db_path: Path) -> None:
        self._db_path = str(db_path)
        self._conn: aiosqlite.Connection | None = None

    async def __aenter__(self):
        self._conn = await aiosqlite.connect(self._db_path)
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.row_factory = aiosqlite.Row
        self._make_proxy()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._conn:
            await self._conn.close()

    def _make_proxy(self):
        """将 conn 上的方法代理到 self，方便统一调用接口。"""
        self._conn_proxy = self._conn

    async def execute(self, sql, params=(), fetch=False, fetch_scalar=False, rowcount=False):
        cursor = await self._conn.execute(sql, params)  # type: ignore[union-attr]
        result: Any = None
        if fetch:
            rows = await cursor.fetchall()
            result = [tuple(r) for r in rows]
        elif fetch_scalar:
            row = await cursor.fetchone()
            result = row[0] if row else 0
        elif rowcount:
            result = cursor.rowcount
        else:
            result = cursor.lastrowid or 0
        await cursor.close()
        return result

    async def commit(self):
        await self._conn.commit()  # type: ignore[union-attr]


class _SyncSqliteConnection:
    """sqlite3 + run_in_executor 异步连接包装。

    所有数据库操作在专用线程中执行，避免 sqlite3 线程亲和性问题。
    """

    def __init__(self, db_path: Path):
        self._db_path = str(db_path)
        self._conn = None

    async def __aenter__(self) -> _SyncConnectionProxy:  # type: ignore[return-value]
        loop = asyncio.get_event_loop()
        self._conn = await loop.run_in_executor(_executor, self._connect_sync)
        return _SyncConnectionProxy(self._conn, loop, _executor)

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._conn:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(_executor, self._conn.close)

    @staticmethod
    def _connect_sync():
        conn = sqlite3.connect(str(StorageManager.DB_PATH))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        return conn


class _SyncConnectionProxy:
    """将同步 sqlite3 连接上的调用包装为异步，所有操作在 executor 线程中执行。"""

    def __init__(self, conn, loop, executor):
        self._conn = conn
        self._loop = loop
        self._executor = executor

    async def execute(self, sql, params=(), fetch=False, fetch_scalar=False, rowcount=False):
        return await self._loop.run_in_executor(
            self._executor,
            self._execute_sync,
            sql,
            params,
            fetch,
            fetch_scalar,
            rowcount,
        )

    def _execute_sync(self, sql, params, fetch, fetch_scalar, rowcount):
        cursor = self._conn.execute(sql, params)
        try:
            if fetch:
                return [tuple(row) for row in cursor.fetchall()]
            if fetch_scalar:
                row = cursor.fetchone()
                return row[0] if row else 0
            if rowcount:
                return cursor.rowcount
            return cursor.lastrowid or 0
        finally:
            cursor.close()

    async def commit(self):
        await self._loop.run_in_executor(self._executor, self._conn.commit)
