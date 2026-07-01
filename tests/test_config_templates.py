"""Standalone tests for workspace template export/import.

Tests ConfigManager directly without going through the full app import chain.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Add src to path so we can import config directly
_src = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(_src))

import yaml

# Import directly from the module file — bypass __init__.py
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "config_module", _src / "termworkspace" / "config.py"
)
_config_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_config_mod)
ConfigManager = _config_mod.ConfigManager


# ── Fixtures ─────────────────────────────────────────────────────────────────


def setup_temp_config():
    """Create a temporary config dir and sample config."""
    tmpdir = tempfile.mkdtemp()
    config_home = Path(tmpdir) / ".termworkspace"
    config_home.mkdir(parents=True, exist_ok=True)
    # Monkey-patch ConfigManager paths
    ConfigManager.CONFIG_DIR = config_home
    ConfigManager.CONFIG_PATH = config_home / "config.yaml"

    config = {
        "providers": {
            "deepseek": {
                "api_key": "***",
                "base_url": "https://api.deepseek.com/v1",
                "models": ["deepseek-chat"],
            },
        },
        "workspaces": {
            "demo": {
                "name": "演示工作区",
                "description": "测试用",
                "default_pane": "main",
                "panes": [
                    {
                        "id": "main",
                        "name": "主窗口",
                        "provider": "deepseek",
                        "model": "deepseek-chat",
                        "system_prompt": "你是一个测试助手。",
                    },
                ],
            },
        },
        "theme": "dark",
    }
    ConfigManager.save(config)
    return tmpdir, config_home


def create_template_file(data: dict) -> str:
    """Create a temporary template YAML file and return its path."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False, encoding="utf-8")
    yaml.dump(data, tmp, allow_unicode=True, sort_keys=False)
    tmp.close()
    return tmp.name


# ── Export tests ─────────────────────────────────────────────────────────────


def test_export_all_workspaces():
    tmpdir, config_home = setup_temp_config()
    try:
        export_path = Path(tmpdir) / "exported.yaml"
        result = ConfigManager.export_workspace(str(export_path))
        assert result is True, "export should succeed"
        assert export_path.is_file(), "file should exist"

        with open(export_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert "workspaces" in data
        assert "demo" in data["workspaces"]
        assert data["workspaces"]["demo"]["name"] == "演示工作区"
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_export_single_workspace():
    tmpdir, config_home = setup_temp_config()
    try:
        export_path = Path(tmpdir) / "single.yaml"
        result = ConfigManager.export_workspace(str(export_path), workspace_key="demo")
        assert result is True

        with open(export_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert "workspaces" in data
        assert len(data["workspaces"]) == 1
        assert "demo" in data["workspaces"]
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_export_nonexistent_workspace():
    tmpdir, config_home = setup_temp_config()
    try:
        export_path = Path(tmpdir) / "ghost.yaml"
        result = ConfigManager.export_workspace(str(export_path), workspace_key="ghost")
        assert result is False
        assert not export_path.is_file()
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_export_no_workspaces():
    tmpdir, config_home = setup_temp_config()
    try:
        # Save config with no workspaces
        ConfigManager.save({"providers": {}})
        export_path = Path(tmpdir) / "empty.yaml"
        result = ConfigManager.export_workspace(str(export_path))
        assert result is False
        assert not export_path.is_file()
    finally:
        import shutil
        shutil.rmtree(tmpdir)


# ── Import tests ─────────────────────────────────────────────────────────────


def test_import_template():
    tmpdir, config_home = setup_temp_config()
    try:
        template_data = {
            "template": {"name": "测试模板", "description": "测试用"},
            "workspaces": {
                "test_ws": {
                    "name": "🧪 测试工作区",
                    "description": "导入测试",
                    "default_pane": "p1",
                    "panes": [
                        {"id": "p1", "name": "测试窗口", "provider": "openai",
                         "model": "gpt-4o", "system_prompt": "test"},
                    ],
                },
            },
        }
        tmpl_path = create_template_file(template_data)
        try:
            count, keys = ConfigManager.import_workspace_template(tmpl_path)
            assert count == 1
            assert keys == ["test_ws"]

            config = ConfigManager.load()
            assert "demo" in config["workspaces"]  # original preserved
            assert "test_ws" in config["workspaces"]  # new one imported
            assert config["workspaces"]["test_ws"]["name"] == "🧪 测试工作区"
        finally:
            os.unlink(tmpl_path)
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_import_overwrite():
    tmpdir, config_home = setup_temp_config()
    try:
        template_data = {
            "template": {"name": "Test"},
            "workspaces": {
                "test_ws": {"name": "Original", "description": "orig",
                            "default_pane": "x", "panes": []},
            },
        }
        tmpl_path = create_template_file(template_data)
        try:
            count, keys = ConfigManager.import_workspace_template(tmpl_path)
            assert count == 1

            # Re-import with modified name
            template_data["workspaces"]["test_ws"]["name"] = "Overwritten"
            with open(tmpl_path, "w", encoding="utf-8") as f:
                yaml.dump(template_data, f, allow_unicode=True, sort_keys=False)

            count, keys = ConfigManager.import_workspace_template(tmpl_path)
            assert count == 1

            config = ConfigManager.load()
            assert config["workspaces"]["test_ws"]["name"] == "Overwritten"
        finally:
            os.unlink(tmpl_path)
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_import_nonexistent_file():
    count, keys = ConfigManager.import_workspace_template("/tmp/nonexistent_xyz.yaml")
    assert count == 0
    assert keys == []


def test_import_empty_template():
    data = {"template": {"name": "empty"}}
    tmpl_path = create_template_file(data)
    try:
        count, keys = ConfigManager.import_workspace_template(tmpl_path)
        assert count == 0
        assert keys == []
    finally:
        os.unlink(tmpl_path)


def test_import_multiple_workspaces():
    tmpdir, config_home = setup_temp_config()
    try:
        multi_data = {
            "template": {"name": "Multi"},
            "workspaces": {
                "ws_a": {"name": "A", "description": "A", "default_pane": "x", "panes": []},
                "ws_b": {"name": "B", "description": "B", "default_pane": "y", "panes": []},
            },
        }
        tmpl_path = create_template_file(multi_data)
        try:
            count, keys = ConfigManager.import_workspace_template(tmpl_path)
            assert count == 2
            assert "ws_a" in keys
            assert "ws_b" in keys

            config = ConfigManager.load()
            assert "ws_a" in config["workspaces"]
            assert "ws_b" in config["workspaces"]
        finally:
            os.unlink(tmpl_path)
    finally:
        import shutil
        shutil.rmtree(tmpdir)


# ── List templates tests ─────────────────────────────────────────────────────


def test_list_templates():
    tmpdir, config_home = setup_temp_config()
    try:
        templates_dir = Path(tmpdir) / "templates"
        templates_dir.mkdir()

        t1 = {"template": {"name": "模板A", "description": "描述A"},
              "workspaces": {"a": {}}}
        t2 = {"template": {"name": "模板B", "description": "描述B"},
              "workspaces": {"b": {}, "c": {}}}

        with open(templates_dir / "t1.yaml", "w", encoding="utf-8") as f:
            yaml.dump(t1, f, allow_unicode=True)
        with open(templates_dir / "t2.yaml", "w", encoding="utf-8") as f:
            yaml.dump(t2, f, allow_unicode=True)

        templates = ConfigManager.list_template_dir(str(templates_dir))
        assert len(templates) == 2

        names = [t["name"] for t in templates]
        assert "模板A" in names
        assert "模板B" in names

        t2_entry = next(t for t in templates if t["name"] == "模板B")
        assert t2_entry["workspace_count"] == "2"
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_list_templates_skips_invalid_yaml():
    tmpdir, config_home = setup_temp_config()
    try:
        templates_dir = Path(tmpdir) / "templates"
        templates_dir.mkdir()

        # Valid
        with open(templates_dir / "good.yaml", "w", encoding="utf-8") as f:
            yaml.dump({"template": {"name": "Good"}, "workspaces": {"x": {}}}, f)

        # Invalid YAML
        with open(templates_dir / "bad.yaml", "w", encoding="utf-8") as f:
            f.write(": broken yaml\n  indentation\n")

        templates = ConfigManager.list_template_dir(str(templates_dir))
        assert len(templates) == 1
        assert templates[0]["name"] == "Good"
    finally:
        import shutil
        shutil.rmtree(tmpdir)


def test_list_templates_nonexistent_dir():
    templates = ConfigManager.list_template_dir("/tmp/nonexistent_dir_xyz")
    assert templates == []


def test_list_templates_fallback_name():
    tmpdir, config_home = setup_temp_config()
    try:
        templates_dir = Path(tmpdir) / "templates"
        templates_dir.mkdir()

        with open(templates_dir / "my-template.yaml", "w", encoding="utf-8") as f:
            yaml.dump({"workspaces": {"x": {}}}, f)

        templates = ConfigManager.list_template_dir(str(templates_dir))
        assert len(templates) == 1
        assert templates[0]["name"] == "my-template"
    finally:
        import shutil
        shutil.rmtree(tmpdir)


# ── Integration test: export then re-import ──────────────────────────────────


def test_export_then_import_roundtrip():
    """Export workspace to YAML, then import it back as a new config."""
    tmpdir, config_home = setup_temp_config()
    try:
        # Export the demo workspace
        export_path = Path(tmpdir) / "roundtrip.yaml"
        result = ConfigManager.export_workspace(str(export_path), workspace_key="demo")
        assert result is True

        # Save a clean config (no workspaces)
        ConfigManager.save({"providers": {}, "theme": "dark"})

        # Import the exported template back
        count, keys = ConfigManager.import_workspace_template(str(export_path))
        assert count == 1
        assert keys == ["demo"]

        config = ConfigManager.load()
        assert "demo" in config["workspaces"]
        assert config["workspaces"]["demo"]["name"] == "演示工作区"
    finally:
        import shutil
        shutil.rmtree(tmpdir)
