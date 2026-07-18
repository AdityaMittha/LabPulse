"""
uploader.py — Uploads hourly summaries to AWS with offline SQLite queue.
Walchand Institute of Technology, Solapur
"""
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pending_summaries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id   TEXT    UNIQUE,
            payload     TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            attempts    INTEGER DEFAULT 0
        )
    """)
    conn.commit()


class Uploader:
    """
    Uploads hourly summary payloads to the backend API.
    If the network is unavailable, queues in local SQLite and retries every
    `retry_interval_minutes` minutes in a background thread.
    """

    def __init__(self, config: dict):
        self.api_url = f"{config['api_base_url']}/agent/summary"
        self.session_end_url = f"{config['api_base_url']}/agent/session-end"
        self.api_key = config["api_key"]
        self.retry_interval = config.get("retry_interval_minutes", 5) * 60

        db_file = _db_path()
        self._conn = sqlite3.connect(db_file, check_same_thread=False)
        _init_db(self._conn)

        self._session_token: str = ""
        self._lock = threading.Lock()
        self._retry_thread: threading.Thread | None = None
        self._running = False

    def set_session_token(self, token: str):
        self._session_token = token

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "Authorization": f"Bearer {self._session_token}",
            "Content-Type": "application/json",
        }

    def _post(self, url: str, payload: dict) -> bool:
        try:
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=15)
            if resp.status_code in (200, 201):
                logger.info("Uploaded %s → %s", payload.get("report_id", "payload"), resp.status_code)
                return True
            else:
                logger.warning("Upload rejected: %s %s", resp.status_code, resp.text[:200])
                return False
        except requests.exceptions.RequestException as exc:
            logger.warning("Upload failed (will queue): %s", exc)
            return False

    def upload_summary(self, payload: dict):
        """Try to upload immediately; queue on failure."""
        success = self._post(self.api_url, payload)
        if not success:
            self._enqueue(payload)

    def send_session_end(self, session_id: str, logout_time: str, total_duration: int):
        payload = {
            "session_id": session_id,
            "logout_time": logout_time,
            "total_duration": total_duration,
        }
        self._post(self.session_end_url, payload)  # best-effort

    def _enqueue(self, payload: dict):
        report_id = payload.get("report_id", "")
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO pending_summaries (report_id, payload, created_at) VALUES (?,?,?)",
                (report_id, json.dumps(payload), now),
            )
            self._conn.commit()
        logger.info("Queued summary %s for later retry", report_id)

    def _flush_queue(self):
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, report_id, payload FROM pending_summaries ORDER BY id LIMIT 20"
            ).fetchall()

        for row_id, report_id, payload_str in rows:
            payload = json.loads(payload_str)
            success = self._post(self.api_url, payload)
            if success:
                with self._lock:
                    self._conn.execute("DELETE FROM pending_summaries WHERE id=?", (row_id,))
                    self._conn.commit()
            else:
                with self._lock:
                    self._conn.execute(
                        "UPDATE pending_summaries SET attempts=attempts+1 WHERE id=?", (row_id,)
                    )
                    self._conn.commit()
                break  # stop on first failure — network likely down

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
        # Final flush attempt
        try:
            self._flush_queue()
        except Exception:
            pass
