"""
config.py — Reads and validates config.json for the LabPulse agent.
Walchand Institute of Technology, Solapur
"""
import json
import os
import sys
import logging

logger = logging.getLogger(__name__)

DEFAULT_CONFIG = {
    "machine_id": "UNKNOWN-PC",
    "lab_id": "UNKNOWN-LAB",
    "lab_name": "Unknown Lab",
    "college_name": "Walchand Institute of Technology, Solapur",
    "api_base_url": "https://localhost/v1",
    "api_key": "",
    "idle_threshold_seconds": 60,
    "summary_interval_minutes": 60,
    "retry_interval_minutes": 5,
    "max_validate_attempts": 3,
    "log_level": "INFO",
}

REQUIRED_KEYS = ["machine_id", "lab_id", "api_base_url", "api_key"]


def load_config() -> dict:
    """Load config.json from the same directory as the executable / script."""
    if getattr(sys, "frozen", False):
        # PyInstaller bundle — config lives next to the .exe
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    config_path = os.path.join(base_dir, "..", "config.json")
    config_path = os.path.normpath(config_path)

    if not os.path.exists(config_path):
        logger.warning("config.json not found at %s — using defaults", config_path)
        return dict(DEFAULT_CONFIG)

    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Merge with defaults so missing keys don't crash
    merged = dict(DEFAULT_CONFIG)
    merged.update(data)

    # Validate required keys
    missing = [k for k in REQUIRED_KEYS if not merged.get(k)]
    if missing:
        logger.error("config.json is missing required keys: %s", missing)
        sys.exit(1)

    logger.info(
        "Config loaded: machine=%s lab=%s api=%s",
        merged["machine_id"],
        merged["lab_id"],
        merged["api_base_url"],
    )
    return merged


# Singleton
_config: dict | None = None


def get_config() -> dict:
    global _config
    if _config is None:
        _config = load_config()
    return _config
