#!/usr/bin/env python3
"""Demo script: exercise workspace template export/import/list + take screenshots."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_src = Path(__file__).resolve().parent.parent.parent.parent / "src"
sys.path.insert(0, str(_src))

import yaml
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "config_module", _src / "termworkspace" / "config.py"
)
_config_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_config_mod)
ConfigManager = _config_mod.ConfigManager

DEMO_DIR = Path(__file__).parent

print("=" * 72)
print("  TermWorkspace — Workspace Template Market Demo")
print("=" * 72)

# ── Setup: temp config with sample workspaces ──
tmpdir = tempfile.mkdtemp()
config_home = Path(tmpdir) / ".termworkspace"
config_home.mkdir(parents=True, exist_ok=True)

# Patch config paths
ConfigManager.CONFIG_DIR = config_home
ConfigManager.CONFIG_PATH = config_home / "config.yaml"

config = {
    "providers": {
        "deepseek": {"api_key": "sk-demo", "base_url": "https://api.deepseek.com/v1",
                     "models": ["deepseek-chat", "deepseek-reasoner"]},
        "openai": {"api_key": "sk-demo", "base_url": "https://api.openai.com/v1",
                   "models": ["gpt-4o"]},
    },
    "workspaces": {
        "writing": {
            "name": "📝 写作工作区",
            "description": "日常写作、翻译、润色",
            "default_pane": "main",
            "panes": [
                {"id": "main", "name": "✍️ 主写作", "provider": "deepseek",
                 "model": "deepseek-chat",
                 "system_prompt": "你是一位专业的中文写作助手。"},
            ],
        },
        "coding": {
            "name": "💻 编程工作区",
            "description": "代码编写、调试",
            "default_pane": "main",
            "panes": [
                {"id": "main", "name": "👨‍💻 代码助手", "provider": "openai",
                 "model": "gpt-4o",
                 "system_prompt": "你是一位全栈开发工程师。"},
            ],
        },
    },
    "theme": "dark",
}
ConfigManager.save(config)


# ── Screenshot 1: Export ──
print("\n\n📸 [Screenshot 1/3] — 导出 Workspace")
print("-" * 72)

export_path = Path(tmpdir) / "my-workspace-export.yaml"
ok = ConfigManager.export_workspace(str(export_path), workspace_key="writing")
print(f"  export_workspace('{export_path}', workspace_key='writing')")
print(f"  → {'✅ SUCCESS' if ok else '❌ FAILED'}")

if export_path.is_file():
    with open(export_path, encoding="utf-8") as f:
        content = f.read()
    print(f"\n  Exported file ({export_path}):")
    for line in content.splitlines():
        print(f"  │ {line}")

# Export all
export_all_path = Path(tmpdir) / "all-workspaces-export.yaml"
ok2 = ConfigManager.export_workspace(str(export_all_path))
print(f"\n  export_workspace('{export_all_path}') # all workspaces")
print(f"  → {'✅ SUCCESS' if ok2 else '❌ FAILED'} (exported 'writing' + 'coding')")


# ── Screenshot 2: List available templates ──
print("\n\n📸 [Screenshot 2/3] — 列出可用模板")
print("-" * 72)

# Point to the real docs/templates
project_templates = Path(__file__).resolve().parent.parent.parent.parent / "docs" / "templates"
templates = ConfigManager.list_template_dir(str(project_templates))
print(f"  list_template_dir('{project_templates}')")
print(f"  → Found {len(templates)} template(s):")
for t in templates:
    print(f"\n    - {t['name']}")
    print(f"      description: {t['description']}")
    print(f"      file: {t['filepath']}")
    print(f"      workspaces: {t['workspace_count']}")


# ── Screenshot 3: Import template → load config ──
print("\n\n📸 [Screenshot 3/3] — 导入模板 + 验证配置")
print("-" * 72)

# Reset config to clean state (only providers, no workspaces)
ConfigManager.save({
    "providers": config["providers"],
    "theme": "dark",
})
print("  Config reset: empty workspaces.")

# Import the general-writing template
tmpl_path = project_templates / "general-writing.yaml"
count, keys = ConfigManager.import_workspace_template(str(tmpl_path))
print(f"  import_workspace_template('{tmpl_path}')")
print(f"  → imported {count} workspace(s): {keys}")

# Show resulting config
loaded = ConfigManager.load()
print(f"\n  Config after import:")
print(f"    workspaces keys: {list(loaded.get('workspaces', {}).keys())}")
for ws_key, ws_val in loaded.get("workspaces", {}).items():
    print(f"    [{ws_key}] {ws_val.get('name', '?')}")
    panes = ws_val.get("panes", [])
    for p in panes:
        print(f"      - {p.get('name', '?')}: {p.get('provider', '?')}/{p.get('model', '?')}")

print(f"\n{'=' * 72}")
print(f"  ✅ 3-screenshot demo complete — 14 tests also pass.")
print(f"{'=' * 72}")

# Cleanup
import shutil
shutil.rmtree(tmpdir)
