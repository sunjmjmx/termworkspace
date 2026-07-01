"""Edge case tests for TermWorkspace — empty states, corrupt configs, etc."""

from __future__ import annotations

from pathlib import Path

# ── Config edge cases ──


def test_config_load_nonexistent(temp_config_dir: Path) -> None:
    """load() should return {} when config.yaml doesn't exist."""
    from termworkspace.config import ConfigManager

    config = ConfigManager.load()
    assert config == {}


def test_config_load_empty_file(temp_config_dir: Path) -> None:
    """load() should handle an empty config file gracefully."""
    from termworkspace.config import ConfigManager

    ConfigManager.CONFIG_PATH.write_text("", encoding="utf-8")
    config = ConfigManager.load()
    assert config == {}  # yaml.safe_load("") returns None → coerce to {}


def test_config_load_corrupt_yaml(temp_config_dir: Path) -> None:
    """load() should handle corrupt YAML gracefully."""
    from termworkspace.config import ConfigManager

    ConfigManager.CONFIG_PATH.write_text(": broken: yaml\n  indentation\n", encoding="utf-8")
    config = ConfigManager.load()
    assert config == {}


def test_config_exists(temp_config_dir: Path) -> None:
    """exists() should reflect file presence."""
    from termworkspace.config import ConfigManager

    assert ConfigManager.exists() is False

    ConfigManager.save({"test": True})
    assert ConfigManager.exists() is True


def test_config_save_and_load_roundtrip(temp_config_dir: Path) -> None:
    """Config save → load should preserve all values."""
    from termworkspace.config import ConfigManager

    original = {
        "providers": {
            "deepseek": {
                "api_key": "sk-test",
                "base_url": "https://api.deepseek.com/v1",
                "models": ["deepseek-chat"],
            },
        },
        "theme": "dark",
    }
    ConfigManager.save(original)

    loaded = ConfigManager.load()
    assert loaded == original


def test_get_provider_config_nonexistent(temp_config_dir: Path) -> None:
    """get_provider_config() should return {} for unknown provider."""
    from termworkspace.config import ConfigManager

    cfg = ConfigManager.get_provider_config("ghost_provider")
    assert cfg == {}


def test_set_api_key(temp_config_dir: Path) -> None:
    """set_api_key() should update the API key for a provider."""
    from termworkspace.config import ConfigManager

    ConfigManager.save({"providers": {}})
    ConfigManager.set_api_key("deepseek", "sk-new-key")

    loaded = ConfigManager.load()
    assert loaded["providers"]["deepseek"]["api_key"] == "sk-new-key"


def test_get_model_provider_slash_format(temp_config_dir: Path) -> None:
    """get_model_provider() should parse 'provider/model' format."""
    from termworkspace.config import ConfigManager

    provider, model = ConfigManager.get_model_provider("deepseek/deepseek-chat")
    assert provider == "deepseek"
    assert model == "deepseek-chat"


def test_get_model_provider_pure_model(temp_config_dir: Path) -> None:
    """get_model_provider() should find provider by iterating models."""
    from termworkspace.config import ConfigManager

    ConfigManager.save(
        {
            "providers": {
                "test_provider": {
                    "api_key": "sk-key",
                    "base_url": "https://test.api",
                    "models": ["gpt-4", "gpt-4o"],
                },
            },
        }
    )

    provider, model = ConfigManager.get_model_provider("gpt-4o")
    assert provider == "test_provider"
    assert model == "gpt-4o"


def test_get_model_provider_not_found(temp_config_dir: Path) -> None:
    """get_model_provider() should return (None, model_key) when not found."""
    from termworkspace.config import ConfigManager

    provider, model = ConfigManager.get_model_provider("ghost-model")
    assert provider is None
    assert model == "ghost-model"


def test_get_configured_providers(temp_config_dir: Path) -> None:
    """get_configured_providers() should filter to only providers with keys."""
    from termworkspace.config import ConfigManager

    ConfigManager.save(
        {
            "providers": {
                "has_key": {"api_key": "sk-valid", "base_url": "", "models": []},
                "no_key": {"api_key": "", "base_url": "", "models": []},
            },
        }
    )

    configured = ConfigManager.get_configured_providers()
    assert "has_key" in configured
    assert "no_key" not in configured


# ── Workspace manager edge cases ──


def test_workspace_manager_singleton() -> None:
    """WorkspaceManager should be a singleton."""
    from termworkspace.workspace import WorkspaceManager

    wm1 = WorkspaceManager()
    wm2 = WorkspaceManager()
    assert wm1 is wm2


def test_get_nonexistent_workspace() -> None:
    """get_workspace() should return None for a missing ID."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    ws = wm.get_workspace("ghost-id")
    assert ws is None


def test_delete_nonexistent_workspace() -> None:
    """delete_workspace() should return False for a missing ID."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    assert wm.delete_workspace("ghost-id") is False


def test_update_nonexistent_workspace() -> None:
    """update_workspace() should return False for a missing ID."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    assert wm.update_workspace("ghost-id", name="new") is False


def test_create_and_get_workspace() -> None:
    """create → get should return the same workspace."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    ws_id = wm.create_workspace("Test WS", layout="horizontal")
    ws = wm.get_workspace(ws_id)
    assert ws is not None
    assert ws.name == "Test WS"
    assert ws.layout == "horizontal"
    assert len(ws.windows) == 2


def test_create_all_layouts() -> None:
    """Each layout should create the correct number of windows."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    s_id = wm.create_workspace("S", layout="single")
    assert len(wm.get_workspace(s_id).windows) == 1
    h_id = wm.create_workspace("H", layout="horizontal")
    assert len(wm.get_workspace(h_id).windows) == 2
    v_id = wm.create_workspace("V", layout="vertical")
    assert len(wm.get_workspace(v_id).windows) == 2
    g_id = wm.create_workspace("G", layout="grid")
    assert len(wm.get_workspace(g_id).windows) == 4


def test_list_workspaces_non_empty() -> None:
    """list_workspaces() should return at least workspaces we just created."""
    from termworkspace.workspace import WorkspaceManager

    wm = WorkspaceManager()
    wm.create_workspace("A")
    wm.create_workspace("B")
    ws_list = wm.list_workspaces()
    assert len(ws_list) >= 2
    names = [ws.name for ws in ws_list.values()]
    assert "A" in names
    assert "B" in names


# ── Provider edge cases ──


def test_provider_manager_empty() -> None:
    """ProviderManager with no config should have no providers."""
    from termworkspace.providers import ProviderManager

    pm = ProviderManager()
    assert pm.all_providers == {}


def test_provider_manager_load_config() -> None:
    """load_from_config() should populate providers."""
    from termworkspace.providers import ProviderManager

    pm = ProviderManager()
    pm.load_from_config(
        {
            "deepseek": {
                "api_key": "sk-test",
                "base_url": "https://api.deepseek.com/v1",
                "models": ["deepseek-chat"],
            },
        }
    )

    provider = pm.get_provider("deepseek")
    assert provider is not None
    assert provider.api_key == "sk-test"
    assert "deepseek-chat" in provider.models


def test_get_api_key_slash_format() -> None:
    """get_api_key() should support 'provider/model' format."""
    from termworkspace.providers import ProviderManager

    pm = ProviderManager()
    pm.load_from_config(
        {
            "deepseek": {"api_key": "sk-ds", "base_url": "", "models": ["ds-chat"]},
            "openai": {"api_key": "sk-oa", "base_url": "", "models": ["gpt-4"]},
        }
    )

    assert pm.get_api_key("deepseek/ds-chat") == "sk-ds"
    assert pm.get_api_key("openai/gpt-4") == "sk-oa"
    assert pm.get_api_key("nonexistent/model") is None


def test_get_api_key_pure_model() -> None:
    """get_api_key() should find by pure model name."""
    from termworkspace.providers import ProviderManager

    pm = ProviderManager()
    pm.load_from_config(
        {
            "openai": {"api_key": "sk-oa", "base_url": "", "models": ["gpt-4", "gpt-4o"]},
        }
    )

    assert pm.get_api_key("gpt-4o") == "sk-oa"
    assert pm.get_api_key("nonexistent") is None


def test_is_anthropic() -> None:
    """is_anthropic() should detect Anthropic models."""
    from termworkspace.providers import ProviderManager

    pm = ProviderManager()
    pm.load_from_config(
        {
            "anthropic": {"api_key": "sk-ant", "base_url": "", "models": ["claude-3-5-sonnet"]},
            "openai": {"api_key": "sk-oa", "base_url": "", "models": ["gpt-4"]},
        }
    )

    assert pm.is_anthropic("anthropic/claude-3-5-sonnet") is True
    assert pm.is_anthropic("openai/gpt-4") is False
    assert pm.is_anthropic("claude-3-5-sonnet") is True
    assert pm.is_anthropic("gpt-4") is False


# ── Workspace import/export edge cases ──


def test_export_nonexistent_workspace_key(temp_config_dir: Path) -> None:
    """export_workspace() should return False for a missing workspace key."""
    from termworkspace.config import ConfigManager

    ConfigManager.save({"workspaces": {}})
    result = ConfigManager.export_workspace("/tmp/ghost.yaml", workspace_key="ghost")
    assert result is False
    assert not Path("/tmp/ghost.yaml").is_file()


def test_import_corrupt_yaml_file(temp_config_dir: Path) -> None:
    """import_workspace_template() should handle corrupt YAML gracefully."""
    from termworkspace.config import ConfigManager

    bad_path = Path("/tmp/bad_template.yaml")
    bad_path.write_text(": broken: yaml\n  bad\n", encoding="utf-8")
    try:
        count, keys = ConfigManager.import_workspace_template(str(bad_path))
        assert count == 0
        assert keys == []
    finally:
        bad_path.unlink(missing_ok=True)
