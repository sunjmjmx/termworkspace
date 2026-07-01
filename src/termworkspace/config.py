"""
TermWorkspace — 配置管理

ConfigManager: 读取 / 写入 ~/.termworkspace/config.yaml
提供首次运行引导 (init_wizard) 以及模型 key 解析功能。
"""

from __future__ import annotations

import os
import sys
import logging
from pathlib import Path
from typing import Any, Optional

import yaml

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 默认配置
# ──────────────────────────────────────────────

DEFAULT_CONFIG: dict[str, Any] = {
    "providers": {
        "deepseek": {
            "api_key": "",
            "base_url": "https://api.deepseek.com/v1",
            "models": ["deepseek-chat", "deepseek-reasoner"],
        },
        "openai": {
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        },
        "anthropic": {
            "api_key": "",
            "base_url": "https://api.anthropic.com/v1",
            "models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
        },
    },
    "workspaces": [
        {
            "name": "默认工作区",
            "layout": "horizontal",
            "windows": [
                {"model": "deepseek/deepseek-chat", "role": "默认助手"},
            ],
        }
    ],
    "theme": "dark",
}


# ──────────────────────────────────────────────
# ConfigManager
# ──────────────────────────────────────────────


class ConfigManager:
    """管理 ~/.termworkspace/config.yaml 的读取、写入和初始化。"""

    CONFIG_DIR = Path.home() / ".termworkspace"
    CONFIG_PATH = CONFIG_DIR / "config.yaml"

    # ── 路径保证 ──────────────────────────────

    @classmethod
    def ensure_dir(cls) -> None:
        """确保配置目录存在，不存在则创建。"""
        cls.CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def exists(cls) -> bool:
        """配置文件是否已存在。"""
        return cls.CONFIG_PATH.is_file()

    # ── 读取 ──────────────────────────────────

    @classmethod
    def load(cls) -> dict[str, Any]:
        """读取 YAML 配置文件，返回 dict。

        如果文件不存在或解析失败，返回空 dict。
        """
        if not cls.CONFIG_PATH.is_file():
            logger.info("config not found at %s, returning empty", cls.CONFIG_PATH)
            return {}

        try:
            with open(cls.CONFIG_PATH, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
            logger.debug("config loaded from %s", cls.CONFIG_PATH)
            return config
        except (OSError, yaml.YAMLError) as exc:
            logger.error("failed to load config: %s", exc)
            return {}

    # ── 写入 ──────────────────────────────────

    @classmethod
    def save(cls, config: dict[str, Any]) -> None:
        """将配置写入 YAML 文件。自动创建目录。"""
        cls.ensure_dir()
        try:
            with open(cls.CONFIG_PATH, "w", encoding="utf-8") as f:
                yaml.dump(
                    config,
                    f,
                    default_flow_style=False,
                    allow_unicode=True,
                    sort_keys=False,
                    indent=2,
                )
            logger.info("config saved to %s", cls.CONFIG_PATH)
        except OSError as exc:
            logger.error("failed to save config: %s", exc)
            raise

    # ── 首次运行引导 ──────────────────────────

    @classmethod
    def init_wizard(cls) -> dict[str, Any]:
        """首次运行引导：交互式输入 API Key，生成配置文件。

        如果 ~/.termworkspace/config.yaml 已存在则直接返回已有配置。
        否则在终端中引导用户输入各 provider 的 API key，保存并返回。
        """
        if cls.exists():
            logger.info("config already exists, skipping init wizard")
            return cls.load()

        cls.ensure_dir()
        config = _deep_copy(DEFAULT_CONFIG)

        print("=" * 60)
        print("  TermWorkspace — 首次配置向导")
        print("=" * 60)
        print()
        print("请配置 AI 模型的 API Key（至少填写一个即可）")
        print()

        providers = config.get("providers", {})
        for pname, pcfg in providers.items():
            print(f"── {pname} ──")
            print(f"   默认地址: {pcfg.get('base_url', '')}")
            url = input(f"   API 地址 (回车使用默认): ").strip()
            if url:
                pcfg["base_url"] = url.rstrip("/")

            key = input(f"   API Key (回车跳过): ").strip()
            if key:
                pcfg["api_key"] = key
                print(f"   ✓ {pname} 已配置")
            else:
                print(f"   - {pname} 已跳过")
            print()

        # 询问是否调整模型列表
        for pname, pcfg in providers.items():
            if pcfg.get("api_key"):
                models_str = input(
                    f"   {pname} 模型列表 (逗号分隔，回车使用默认: {', '.join(pcfg.get('models', []))}): "
                ).strip()
                if models_str:
                    pcfg["models"] = [m.strip() for m in models_str.split(",") if m.strip()]

        # workspace 名称
        ws_name = input("工作区名称 (回车使用「默认工作区」): ").strip()
        if ws_name:
            config["workspaces"][0]["name"] = ws_name

        # 主题
        theme = input("主题 dark/light (回车使用 dark): ").strip().lower()
        if theme in ("dark", "light"):
            config["theme"] = theme

        cls.save(config)
        print()
        print("✓ 配置文件已生成:", cls.CONFIG_PATH)
        print("  你可以随时编辑此文件修改配置。")
        print()

        return config

    # ── 获取 / 设置 ────────────────────────────

    @classmethod
    def get_provider_config(cls, provider_name: str) -> dict[str, Any]:
        """获取指定 provider 的配置，不存在则返回空 dict。"""
        config = cls.load()
        providers = config.get("providers", {})
        return providers.get(provider_name, {})

    @classmethod
    def set_api_key(cls, provider_name: str, api_key: str) -> None:
        """设置指定 provider 的 API key。"""
        config = cls.load()
        providers = config.setdefault("providers", {})
        provider = providers.setdefault(provider_name, {})
        provider["api_key"] = api_key
        cls.save(config)

    # ── 模型 key 解析 ─────────────────────────

    @classmethod
    def get_model_provider(cls, model_key: str) -> tuple[Optional[str], Optional[str]]:
        """解析 "deepseek/deepseek-chat" 格式的模型 key。

        Returns:
            (provider_name, model_name)  — 如果格式正确
            (None, model_key)            — 如果无法解析
        """
        if not model_key or not isinstance(model_key, str):
            return None, model_key

        if "/" in model_key:
            parts = model_key.split("/", 1)
            provider_name = parts[0].strip()
            model_name = parts[1].strip()
            return provider_name if provider_name else None, model_name if model_name else None

        # 纯模型名 — 需要遍历查找
        config = cls.load()
        providers = config.get("providers", {})
        for pname, pcfg in providers.items():
            models = pcfg.get("models", [])
            if model_key in models:
                return pname, model_key

        return None, model_key

    @classmethod
    def get_configured_providers(cls) -> dict[str, Any]:
        """获取所有已配置（有 api_key）的 provider。"""
        config = cls.load()
        providers = config.get("providers", {})
        return {k: v for k, v in providers.items() if v.get("api_key")}

    @classmethod
    def get_workspaces(cls) -> list[dict[str, Any]]:
        """获取 workspace 列表。"""
        config = cls.load()
        return config.get("workspaces", [])

    @classmethod
    def save_workspaces(cls, workspaces: list[dict[str, Any]]) -> None:
        """保存 workspace 列表到配置。"""
        config = cls.load()
        config["workspaces"] = workspaces
        cls.save(config)

    @classmethod
    def get_theme(cls) -> str:
        """获取主题配置。"""
        config = cls.load()
        return config.get("theme", "dark")

    # ── 模板导入/导出 ────────────────────────────

    @classmethod
    def export_workspace(
        cls,
        filepath: str | Path,
        workspace_key: str | None = None,
    ) -> bool:
        """将当前配置中的 workspace(s) 导出为 YAML 模板文件。

        Args:
            filepath: 输出 YAML 文件路径。
            workspace_key: 要导出的 workspace key（如 'writing'）。
                          为 None 时导出所有 workspace。

        Returns:
            True 表示成功，False 表示失败。
        """
        config = cls.load()
        workspaces = config.get("workspaces", {})

        if not workspaces:
            logger.warning("no workspaces to export")
            return False

        if workspace_key is not None:
            if workspace_key not in workspaces:
                logger.error("workspace '%s' not found", workspace_key)
                return False
            data = {"workspaces": {workspace_key: workspaces[workspace_key]}}
        else:
            data = {"workspaces": workspaces}

        # Write YAML
        try:
            dest = Path(filepath)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "w", encoding="utf-8") as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False, indent=2)
            logger.info("workspace exported to %s", dest)
            return True
        except OSError as exc:
            logger.error("failed to export workspace: %s", exc)
            return False

    @classmethod
    def import_workspace_template(
        cls,
        filepath: str | Path,
    ) -> tuple[int, list[str]]:
        """从 YAML 模板文件导入 workspace(s)，合并到当前配置。

        支持两种格式：
          - 纯 workspaces::
              workspaces:
                writing: { ... }
          - 含 template 元数据::
              template: { name, description, ... }
              workspaces: { ... }

        Args:
            filepath: 模板 YAML 文件路径。

        Returns:
            (imported_count, imported_keys) — 导入的 workspace 数量和 key 列表。
            导入的 workspace 会覆盖同名的已有 workspace。
        """
        src = Path(filepath)
        if not src.is_file():
            logger.error("template file not found: %s", src)
            return 0, []

        try:
            with open(src, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError) as exc:
            logger.error("failed to read template: %s", exc)
            return 0, []

        workspaces = data.get("workspaces", {})
        if not workspaces or not isinstance(workspaces, dict):
            logger.warning("no workspaces found in template: %s", src)
            return 0, []

        # Merge into current config
        config = cls.load()
        existing = config.setdefault("workspaces", {})

        imported_keys: list[str] = []
        for key, ws_config in workspaces.items():
            existing[key] = ws_config
            imported_keys.append(key)

        cls.save(config)
        logger.info("imported %d workspace(s) from %s: %s", len(imported_keys), src, imported_keys)
        return len(imported_keys), imported_keys

    @classmethod
    def list_template_dir(cls, templates_dir: str | Path = "docs/templates") -> list[dict[str, str]]:
        """扫描模板目录，列出所有可用模板的元信息。

        Args:
            templates_dir: 模板目录路径（默认 docs/templates）。

        Returns:
            模板信息列表，每项包含 name, description, filepath。
        """
        td = Path(templates_dir)
        if not td.is_dir():
            return []

        templates: list[dict[str, str]] = []
        for yaml_file in sorted(td.glob("*.yaml")):
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}

                tmpl = data.get("template", {})
                ws_count = len(data.get("workspaces", {}))

                templates.append({
                    "name": tmpl.get("name", yaml_file.stem),
                    "description": tmpl.get("description", ""),
                    "filepath": str(yaml_file),
                    "workspace_count": str(ws_count),
                })
            except (OSError, yaml.YAMLError):
                continue

        return templates


# ── 内部工具函数 ──────────────────────────────


def _deep_copy(obj: Any) -> Any:
    """简单的深拷贝，适用于纯 JSON 结构。"""
    if isinstance(obj, dict):
        return {k: _deep_copy(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deep_copy(item) for item in obj]
    return obj
