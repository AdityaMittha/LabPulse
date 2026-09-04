"""
offline_store.py — Manages local persistence for the LabPulse agent.

Responsibilities:
  1. pending_session.json  — stores the current session details so that if the
     machine shuts down without completing a sync, the next boot can send the
     proper session-end to the backend.
  2. Boot-time offline queue drain — flushes any SQLite-queued summaries before
     showing the PNR login prompt.
"""

import json
import logging
import os
import sys
import time

logger = logging.getLogger(__name__)


# ── Paths ─────────────────────────────────────────────────────────────────────

def _base_dir() -> str:
    """Return the agent root directory regardless of frozen/dev mode."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def _pending_session_path() -> str:
    return os.path.join(_base_dir(), "pending_session.json")


# ── Pending session ───────────────────────────────────────────────────────────

def save_pending_session(session_id: str, student_id: str, student_name: str,
                         login_time: str, machine_id: str, lab_id: str,
                         timetable_slot: str) -> None:
    """
    Write session metadata to disk.
    Called right after a session starts so the data survives a hard shutdown.
    """
    data = {
        "session_id":     session_id,
        "student_id":     student_id,
        "student_name":   student_name,
        "login_time":     login_time,
        "machine_id":     machine_id,
        "lab_id":         lab_id,
        "timetable_slot": timetable_slot,
        "saved_at":       time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    path = _pending_session_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.debug("Pending session saved → %s", path)
    except OSError as exc:
        logger.warning("Could not save pending session: %s", exc)


def load_pending_session() -> dict | None:
    """
    Load pending session from disk.
    Returns the dict if present, or None if no pending session exists.
    """
    path = _pending_session_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Found pending session: %s (student=%s)", data.get("session_id"), data.get("student_id"))
        return data
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read pending session: %s", exc)
        return None


def clear_pending_session() -> None:
    """Delete pending_session.json after a successful session-end sync."""
    path = _pending_session_path()
    try:
        if os.path.exists(path):
            os.remove(path)
            logger.debug("Pending session cleared")
    except OSError as exc:
        logger.warning("Could not clear pending session: %s", exc)


# ── Boot-time drain ───────────────────────────────────────────────────────────

def drain_on_boot(uploader, timeout_seconds: int = 45) -> bool:
    """
    Called at agent startup before showing the login prompt.

    1. Flushes any queued offline summaries (from a previous failed sync).
    2. Sends session-end for any pending session from the previous boot.

    Returns True if all queued items were flushed, False if some remain.
    """
    logger.info("Boot drain: flushing offline queue…")
    start = time.time()

    # ── Step 1: Flush pending summaries ──────────────────────────────────────
    flushed = _flush_with_timeout(uploader, timeout_seconds)

    elapsed = time.time() - start
    remaining = timeout_seconds - elapsed

    # ── Step 2: Handle pending session-end from previous boot ────────────────
    pending = load_pending_session()
    if pending:
        logger.info("Boot drain: sending session-end for pending session %s", pending["session_id"])
        logout_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        login_ts  = _parse_ts(pending.get("login_time", logout_time))
        logout_ts = _parse_ts(logout_time)
        total     = max(0, int(logout_ts - login_ts))

        ok = uploader.send_session_end_with_fallback(
            pending["session_id"], logout_time, total
        )
        if ok:
            clear_pending_session()
            logger.info("Boot drain: pending session-end sent and cleared")
        else:
            logger.warning("Boot drain: session-end still offline, will retry later")

    return flushed


def _flush_with_timeout(uploader, timeout_seconds: int) -> bool:
    """Drain the SQLite queue up to timeout_seconds. Returns True if fully empty."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        count = uploader.queue_size()
        if count == 0:
            logger.info("Boot drain: queue empty ✓")
            return True
        logger.info("Boot drain: %d items in queue — flushing…", count)
        uploader._flush_queue()
        if uploader.queue_size() > 0:
            time.sleep(3)  # brief pause before retry
    remaining = uploader.queue_size()
    if remaining > 0:
        logger.warning("Boot drain: %d items still queued after timeout", remaining)
        return False
    return True


def _parse_ts(ts_str: str) -> float:
    """Parse ISO-8601 UTC timestamp to epoch float."""
    try:
        return time.mktime(time.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ"))
    except (ValueError, TypeError):
        return time.time()
