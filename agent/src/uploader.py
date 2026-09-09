"""Uploads hourly summaries to the backend. Queues in SQLite if offline."""

import json
import logging
import os
import sqlite3
import sys
import threading
import time

import requests

logger = logging.getLogger(__name__)


def _db_path() -> str:
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "..", "offline_queue.db")


def _init_db(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pending_summaries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id   TEXT    UNIQUE,
            payload     TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            attempts    INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS pending_session_ends (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT    UNIQUE,
            logout_time  TEXT    NOT NULL,
            total_duration INTEGER NOT NULL,
            created_at   TEXT    NOT NULL,
            attempts     INTEGER DEFAULT 0
        );
    """)
    conn.commit()


class Uploader:
    """
    Uploads hourly summary payloads and session-end events to the backend API.

    If the network is unavailable, items are queued in a local SQLite database
    and retried every `retry_interval_minutes` minutes in a background thread.

    On the next boot, `offline_store.drain_on_boot()` calls `_flush_queue()`
    synchronously before any new session starts.
    """

    def __init__(self, config: dict):
        self.summary_url     = f"{config['api_base_url']}/agent/summary"
        self.session_end_url = f"{config['api_base_url']}/agent/session-end"
        self.heartbeat_url   = f"{config['api_base_url']}/agent/heartbeat"
        self.api_key         = config["api_key"]
        self.retry_interval  = config.get("retry_interval_minutes", 5) * 60
        self.heartbeat_interval = config.get("heartbeat_interval_minutes", 8) * 60

        db_file = _db_path()
        self._conn = sqlite3.connect(db_file, check_same_thread=False)
        _init_db(self._conn)

        self._session_token: str = ""
        self._lock = threading.Lock()
        self._retry_thread: threading.Thread | None = None
        self._running = False

    # ── Auth ──────────────────────────────────────────────────────────────────

    def set_session_token(self, token: str):
        self._session_token = token

    def _headers(self) -> dict:
        return {
            "x-api-key":     self.api_key,
            "Authorization": f"Bearer {self._session_token}",
            "Content-Type":  "application/json",
        }

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _post(self, url: str, payload: dict, timeout: int = 15) -> bool:
        try:
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=timeout)
            if resp.status_code in (200, 201):
                logger.info("Uploaded → %s (%s)", url.split("/")[-1], resp.status_code)
                return True
            logger.warning("Upload rejected: %s %s", resp.status_code, resp.text[:200])
            return False
        except requests.exceptions.RequestException as exc:
            logger.warning("Upload failed (will queue): %s", exc)
            return False

    # ── Heartbeat ──────────────────────────────────────────────────────────────

    def send_heartbeat(self, machine_id: str, session_id: str = "") -> bool:
        """Send a lightweight heartbeat ping to keep last_seen_at current.
        Called every heartbeat_interval (default 8 minutes) so the dashboard
        always shows real-time machine online status between hourly summaries.
        """
        payload = {
            "machine_id": machine_id,
            "session_id": session_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        try:
            resp = requests.post(
                self.heartbeat_url, json=payload,
                headers=self._headers(), timeout=8,
            )
            if resp.status_code in (200, 201, 204):
                logger.debug("Heartbeat sent ✓")
                return True
            logger.debug("Heartbeat rejected: %s", resp.status_code)
            return False
        except requests.exceptions.RequestException as exc:
            logger.debug("Heartbeat failed (network): %s", exc)
            return False

    def start_heartbeat_loop(self, machine_id: str, session_id: str = ""):
        """Start background thread that sends periodic heartbeats."""
        def _loop():
            while self._running:
                time.sleep(self.heartbeat_interval)
                try:
                    self.send_heartbeat(machine_id, session_id)
                except Exception as exc:
                    logger.debug("Heartbeat loop error: %s", exc)

        hb_thread = threading.Thread(target=_loop, daemon=True, name="uploader-heartbeat")
        hb_thread.start()
        logger.info("Heartbeat loop started (interval=%ds)", self.heartbeat_interval)

    # ── Hourly summaries ──────────────────────────────────────────────────────

    def upload_summary(self, payload: dict):
        """Try to upload immediately; queue in SQLite on failure."""
        if not self._post(self.summary_url, payload):
            self._enqueue_summary(payload)

    def _enqueue_summary(self, payload: dict):
        report_id = payload.get("report_id", "")
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO pending_summaries (report_id, payload, created_at) VALUES (?,?,?)",
                (report_id, json.dumps(payload), now),
            )
            self._conn.commit()
        logger.info("Queued summary %s for later retry", report_id)

    # ── Session-end ───────────────────────────────────────────────────────────

    def send_session_end(self, session_id: str, logout_time: str, total_duration: int) -> bool:
        """Best-effort session-end. Returns True on success."""
        payload = {
            "session_id":     session_id,
            "logout_time":    logout_time,
            "total_duration": total_duration,
        }
        return self._post(self.session_end_url, payload)

    def send_session_end_with_fallback(self, session_id: str, logout_time: str,
                                       total_duration: int) -> bool:
        """
        Send session-end; if it fails, queue to SQLite so it's retried on next boot.
        Returns True only if the network send succeeded.
        """
        payload = {
            "session_id":     session_id,
            "logout_time":    logout_time,
            "total_duration": total_duration,
        }
        ok = self._post(self.session_end_url, payload)
        if not ok:
            self._enqueue_session_end(session_id, logout_time, total_duration)
        return ok

    def _enqueue_session_end(self, session_id: str, logout_time: str, total_duration: int):
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO pending_session_ends "
                "(session_id, logout_time, total_duration, created_at) VALUES (?,?,?,?)",
                (session_id, logout_time, total_duration, now),
            )
            self._conn.commit()
        logger.info("Queued session-end %s for later retry", session_id)

    # ── Queue management ──────────────────────────────────────────────────────

    def queue_size(self) -> int:
        """Return total number of items pending in the offline queue."""
        with self._lock:
            summaries = self._conn.execute(
                "SELECT COUNT(*) FROM pending_summaries"
            ).fetchone()[0]
            session_ends = self._conn.execute(
                "SELECT COUNT(*) FROM pending_session_ends"
            ).fetchone()[0]
        return summaries + session_ends

    def _flush_queue(self):
        """Attempt to flush all pending items. Stops on first network failure."""
        # ── Session-ends first (important for analytics accuracy) ─────────────
        with self._lock:
            ends = self._conn.execute(
                "SELECT id, session_id, logout_time, total_duration "
                "FROM pending_session_ends ORDER BY id LIMIT 10"
            ).fetchall()

        for row_id, session_id, logout_time, total_duration in ends:
            ok = self.send_session_end(session_id, logout_time, total_duration)
            if ok:
                with self._lock:
                    self._conn.execute("DELETE FROM pending_session_ends WHERE id=?", (row_id,))
                    self._conn.commit()
            else:
                with self._lock:
                    self._conn.execute(
                        "UPDATE pending_session_ends SET attempts=attempts+1 WHERE id=?", (row_id,)
                    )
                    self._conn.commit()
                return  # network is down, stop

        # ── Hourly summaries ──────────────────────────────────────────────────
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, report_id, payload FROM pending_summaries ORDER BY id LIMIT 20"
            ).fetchall()

        for row_id, report_id, payload_str in rows:
            payload = json.loads(payload_str)
            ok = self._post(self.summary_url, payload)
            if ok:
                with self._lock:
                    self._conn.execute("DELETE FROM pending_summaries WHERE id=?", (row_id,))
                    self._conn.commit()
            else:
                with self._lock:
                    self._conn.execute(
                        "UPDATE pending_summaries SET attempts=attempts+1 WHERE id=?", (row_id,)
                    )
                    self._conn.commit()
                break

    # ── Background retry loop ─────────────────────────────────────────────────

    def _retry_loop(self):
        while self._running:
            time.sleep(self.retry_interval)
            try:
                self._flush_queue()
            except Exception as exc:
                logger.debug("Retry loop error: %s", exc)

    def start_retry_loop(self):
        self._running = True
        self._retry_thread = threading.Thread(
            target=self._retry_loop, daemon=True, name="uploader-retry"
        )
        self._retry_thread.start()

    def stop(self):
        self._running = False
        try:
            self._flush_queue()
        except Exception:
            pass
