"""Shared fixtures for TermWorkspace tests."""

from __future__ import annotations

import shutil
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest


@pytest.fixture
def temp_config_dir() -> Generator[Path, None, None]:
    """Create a temporary ~/.termworkspace directory.

    Patches ConfigManager.CONFIG_DIR / CONFIG_PATH to point to the
    temp directory.  Cleans up the temp directory after the test.
    """
    tmpdir = Path(tempfile.mkdtemp())
    config_home = tmpdir / ".termworkspace"
    config_home.mkdir(parents=True, exist_ok=True)

    # Save originals
    from termworkspace.config import ConfigManager

    _orig_dir = ConfigManager.CONFIG_DIR
    _orig_path = ConfigManager.CONFIG_PATH
    ConfigManager.CONFIG_DIR = config_home
    ConfigManager.CONFIG_PATH = config_home / "config.yaml"

    yield config_home

    # Restore
    ConfigManager.CONFIG_DIR = _orig_dir
    ConfigManager.CONFIG_PATH = _orig_path
    shutil.rmtree(tmpdir)


@pytest.fixture
def temp_db_dir() -> Generator[Path, None, None]:
    """Create a temporary database directory.

    Patches StorageManager.DB_DIR / DB_PATH to point to the
    temp directory.  Cleans up after the test.
    """
    tmpdir = Path(tempfile.mkdtemp())

    from termworkspace.storage import StorageManager

    _orig_dir = StorageManager.DB_DIR
    _orig_path = StorageManager.DB_PATH
    StorageManager.DB_DIR = tmpdir
    StorageManager.DB_PATH = tmpdir / "data.db"

    yield tmpdir

    StorageManager.DB_DIR = _orig_dir
    StorageManager.DB_PATH = _orig_path
    shutil.rmtree(tmpdir)
