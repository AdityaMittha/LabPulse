"""
test_agent_features.py - Comprehensive test suite for the LabPulse agent.
Tests every feature: config, auth, tracker, summarizer, uploader, session lifecycle.

Run:  python -m pytest test_agent_features.py -v
  or: python test_agent_features.py
"""
import json
import os
import sqlite3
import sys
import tempfile
import time
import threading
import unittest
from unittest.mock import patch, MagicMock
from collections import defaultdict

# --- Ensure agent src is importable ---
AGENT_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
sys.path.insert(0, AGENT_SRC)


# ===========================================================================
#  1. CONFIG TESTS
# ===========================================================================
class TestConfig(unittest.TestCase):
    """Tests for config.py - loading, validation, defaults."""

    def setUp(self):
        import config as cfg_mod
        cfg_mod._config = None

    def test_load_valid_config(self):
        """Config loads correctly from config.json with all fields."""
        from config import load_config
        cfg = load_config()
        self.assertEqual(cfg["machine_id"], "CSL1-PC-01")
        self.assertEqual(cfg["lab_id"], "CS-LAB-1")
        self.assertIn("api_base_url", cfg)
        self.assertIn("api_key", cfg)
        print("  [PASS] Config loads correctly with all required fields")

    def test_default_values_merged(self):
        """Missing optional keys fall back to defaults."""
        from config import load_config
        cfg = load_config()
        self.assertEqual(cfg.get("idle_threshold_seconds"), 60)
        self.assertEqual(cfg.get("summary_interval_minutes"), 60)
        self.assertEqual(cfg.get("retry_interval_minutes"), 5)
        self.assertEqual(cfg.get("max_validate_attempts"), 3)
        print("  [PASS] Default values correctly merged for optional keys")

    def test_singleton_returns_same_object(self):
        """get_config() returns a singleton."""
        from config import get_config
        c1 = get_config()
        c2 = get_config()
        self.assertIs(c1, c2)
        print("  [PASS] get_config() returns singleton instance")

    def test_required_keys_present(self):
        """All REQUIRED_KEYS are present in loaded config."""
        from config import load_config, REQUIRED_KEYS
        cfg = load_config()
        for key in REQUIRED_KEYS:
            self.assertIn(key, cfg)
            self.assertTrue(cfg[key], f"Required key '{key}' is empty")
        print("  [PASS] All required keys present and non-empty")

    def test_missing_config_uses_defaults(self):
        """DEFAULT_CONFIG has sensible structure."""
        from config import DEFAULT_CONFIG
        self.assertIn("machine_id", DEFAULT_CONFIG)
        self.assertIn("idle_threshold_seconds", DEFAULT_CONFIG)
        self.assertEqual(DEFAULT_CONFIG["idle_threshold_seconds"], 60)
        print("  [PASS] DEFAULT_CONFIG has correct structure and values")


# ===========================================================================
#  2. AUTH TESTS
# ===========================================================================
class TestAuth(unittest.TestCase):
    """Tests for auth.py - credential validation, error handling, offline mode."""

    def _make_config(self):
        return {
            "api_base_url": "https://test-api.example.com/v1",
            "api_key": "test-key-123",
            "machine_id": "TEST-PC-01",
            "lab_id": "TEST-LAB-1",
        }

    @patch("auth.requests.post")
    def test_successful_login(self, mock_post):
        """Successful validation returns AuthResult with student_id and token."""
        from auth import validate_college_id
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "student_id": "STU001",
                "session_token": "tok-abc",
                "timetable_slot": "MON-09-10",
            },
        )
        result = validate_college_id("2023BCS001", "pass123", self._make_config())
        self.assertTrue(result.success)
        self.assertEqual(result.student_id, "STU001")
        self.assertEqual(result.session_token, "tok-abc")
        self.assertEqual(result.timetable_slot, "MON-09-10")
        print("  [PASS] Successful login returns correct AuthResult")

    @patch("auth.requests.post")
    def test_invalid_credentials_401(self, mock_post):
        """401 response returns failure with appropriate error."""
        from auth import validate_college_id
        mock_post.return_value = MagicMock(status_code=401)
        result = validate_college_id("wrong_id", "wrong_pw", self._make_config())
        self.assertFalse(result.success)
        self.assertIn("Invalid", result.error)
        print("  [PASS] Invalid credentials (401) handled correctly")

    @patch("auth.requests.post")
    def test_unregistered_machine_403(self, mock_post):
        """403 response for unregistered machine."""
        from auth import validate_college_id
        mock_post.return_value = MagicMock(status_code=403)
        result = validate_college_id("id", "pw", self._make_config())
        self.assertFalse(result.success)
        self.assertIn("not registered", result.error)
        print("  [PASS] Unregistered machine (403) handled correctly")

    @patch("auth.requests.post")
    def test_server_error_500(self, mock_post):
        """500 response returns server error."""
        from auth import validate_college_id
        mock_post.return_value = MagicMock(status_code=500, text="Internal Server Error")
        result = validate_college_id("id", "pw", self._make_config())
        self.assertFalse(result.success)
        self.assertIn("Server error", result.error)
        print("  [PASS] Server error (500) handled correctly")

    @patch("auth.requests.post", side_effect=__import__("requests").exceptions.ConnectionError("No network"))
    def test_offline_mode(self, mock_post):
        """ConnectionError triggers offline mode."""
        from auth import validate_college_id
        result = validate_college_id("id", "pw", self._make_config())
        self.assertFalse(result.success)
        self.assertEqual(result.error, "OFFLINE")
        print("  [PASS] Offline mode (ConnectionError) handled correctly")

    @patch("auth.requests.post", side_effect=__import__("requests").exceptions.Timeout("Timed out"))
    def test_timeout(self, mock_post):
        """Timeout returns appropriate error."""
        from auth import validate_college_id
        result = validate_college_id("id", "pw", self._make_config())
        self.assertFalse(result.success)
        self.assertIn("timed out", result.error)
        print("  [PASS] Timeout handled correctly")

    def test_auth_result_fields(self):
        """AuthResult has all expected fields."""
        from auth import AuthResult
        ar = AuthResult(success=True, student_id="S1", session_token="T1",
                        timetable_slot="MON-09", error="")
        self.assertTrue(ar.success)
        self.assertEqual(ar.student_id, "S1")
        self.assertEqual(ar.session_token, "T1")
        self.assertEqual(ar.timetable_slot, "MON-09")
        self.assertEqual(ar.error, "")
        print("  [PASS] AuthResult data class has all expected fields")

    @patch("auth.requests.post")
    def test_credentials_sent_correctly(self, mock_post):
        """Verify the payload sent to the API has the right structure."""
        from auth import validate_college_id
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {
            "student_id": "S1", "session_token": "T1", "timetable_slot": "NONE",
        })
        validate_college_id("2023BCS001", "mypassword", self._make_config())
        call_kwargs = mock_post.call_args
        sent_payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        self.assertEqual(sent_payload["college_login"], "2023BCS001")
        self.assertEqual(sent_payload["password"], "mypassword")
        self.assertEqual(sent_payload["machine_id"], "TEST-PC-01")
        self.assertEqual(sent_payload["lab_id"], "TEST-LAB-1")
        self.assertIn("timestamp", sent_payload)
        print("  [PASS] Credentials payload sent with correct structure")


# ===========================================================================
#  3. TRACKER TESTS
# ===========================================================================
class TestTracker(unittest.TestCase):
    """Tests for tracker.py - activity tracking, snapshot, privacy."""

    def test_snapshot_returns_correct_structure(self):
        """snapshot_and_reset returns all required fields."""
        from tracker import ActivityTracker
        t = ActivityTracker(idle_threshold_seconds=60)
        t._app_seconds["chrome.exe"] = 120.0
        t._app_seconds["code.exe"] = 300.0
        t._app_opens["chrome.exe"] = 2
        t._app_opens["code.exe"] = 1
        t._keyboard_count = 500
        t._mouse_click_count = 80
        t._mouse_move_count = 2000
        t._active_seconds = 350.0
        t._idle_seconds = 70.0

        snap = t.snapshot_and_reset()

        self.assertIn("app_usage", snap)
        self.assertIn("keyboard_count", snap)
        self.assertIn("mouse_click_count", snap)
        self.assertIn("mouse_move_count", snap)
        self.assertIn("active_time", snap)
        self.assertIn("idle_time", snap)

        self.assertEqual(snap["app_usage"]["chrome.exe"]["active_duration"], 120)
        self.assertEqual(snap["app_usage"]["chrome.exe"]["open_count"], 2)
        self.assertEqual(snap["app_usage"]["code.exe"]["active_duration"], 300)
        self.assertEqual(snap["keyboard_count"], 500)
        self.assertEqual(snap["mouse_click_count"], 80)
        self.assertEqual(snap["mouse_move_count"], 2000)
        self.assertEqual(snap["active_time"], 350)
        self.assertEqual(snap["idle_time"], 70)
        print("  [PASS] Snapshot returns correct structure with all fields")

    def test_snapshot_resets_counters(self):
        """After snapshot_and_reset, all counters are zeroed."""
        from tracker import ActivityTracker
        t = ActivityTracker()
        t._app_seconds["notepad.exe"] = 60.0
        t._keyboard_count = 100
        t._mouse_click_count = 20
        t._active_seconds = 60.0
        t._idle_seconds = 10.0

        t.snapshot_and_reset()

        snap2 = t.snapshot_and_reset()
        self.assertEqual(len(snap2["app_usage"]), 0)
        self.assertEqual(snap2["keyboard_count"], 0)
        self.assertEqual(snap2["mouse_click_count"], 0)
        self.assertEqual(snap2["mouse_move_count"], 0)
        self.assertEqual(snap2["active_time"], 0)
        self.assertEqual(snap2["idle_time"], 0)
        print("  [PASS] Snapshot correctly resets all counters after read")

    def test_no_key_values_stored(self):
        """Privacy: tracker never stores actual key values."""
        from tracker import ActivityTracker
        t = ActivityTracker()
        attrs = vars(t)
        for name, val in attrs.items():
            self.assertNotIn("key_value", name.lower())
            self.assertNotIn("keystroke", name.lower())
        self.assertIsInstance(t._keyboard_count, int)
        print("  [PASS] Privacy verified: no key values stored, only counts")

    def test_thread_safety_of_snapshot(self):
        """Concurrent access to snapshot_and_reset is thread-safe."""
        from tracker import ActivityTracker
        t = ActivityTracker()
        t._keyboard_count = 1000
        t._app_seconds["test.exe"] = 500.0
        t._active_seconds = 500.0

        results = []

        def grab_snapshot():
            snap = t.snapshot_and_reset()
            results.append(snap)

        threads = [threading.Thread(target=grab_snapshot) for _ in range(5)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

        total_kb = sum(r["keyboard_count"] for r in results)
        self.assertEqual(total_kb, 1000, "Total keyboard_count across threads should be 1000")
        non_zero = [r for r in results if r["keyboard_count"] > 0]
        self.assertEqual(len(non_zero), 1, "Only one thread should get the non-zero data")
        print("  [PASS] Thread safety verified: snapshot_and_reset is atomic")

    def test_idle_threshold_configuration(self):
        """Idle threshold is configurable."""
        from tracker import ActivityTracker
        t1 = ActivityTracker(idle_threshold_seconds=30)
        t2 = ActivityTracker(idle_threshold_seconds=120)
        self.assertEqual(t1.idle_threshold, 30)
        self.assertEqual(t2.idle_threshold, 120)
        print("  [PASS] Idle threshold is configurable")

    def test_start_stop_lifecycle(self):
        """Tracker can start and stop cleanly."""
        from tracker import ActivityTracker

        with patch("tracker._get_foreground_app", return_value="test.exe"), \
             patch("tracker._get_idle_seconds", return_value=0.0):
            t = ActivityTracker(idle_threshold_seconds=60)
            t._start_pynput = MagicMock()
            t._stop_pynput = MagicMock()

            t.start()
            self.assertTrue(t._running)
            time.sleep(0.2)
            t.stop()
            self.assertFalse(t._running)
        print("  [PASS] Tracker start/stop lifecycle works correctly")

    def test_apps_with_zero_seconds_excluded(self):
        """Apps with 0 active seconds are excluded from snapshot."""
        from tracker import ActivityTracker
        t = ActivityTracker()
        t._app_seconds["active.exe"] = 100.0
        t._app_seconds["zero.exe"] = 0.0
        snap = t.snapshot_and_reset()
        self.assertIn("active.exe", snap["app_usage"])
        self.assertNotIn("zero.exe", snap["app_usage"])
        print("  [PASS] Apps with 0 active seconds excluded from snapshot")


# ===========================================================================
#  4. SUMMARIZER TESTS
# ===========================================================================
class TestSummarizer(unittest.TestCase):
    """Tests for summarizer.py - payload structure, privacy checks, hour boundary."""

    def _sample_snapshot(self):
        return {
            "app_usage": {
                "chrome.exe": {"active_duration": 1200, "open_count": 3},
                "code.exe": {"active_duration": 2400, "open_count": 1},
                "notepad.exe": {"active_duration": 300, "open_count": 5},
            },
            "keyboard_count": 4500,
            "mouse_click_count": 350,
            "mouse_move_count": 12000,
            "active_time": 3600,
            "idle_time": 200,
        }

    def test_summary_payload_structure(self):
        """build_summary returns a well-structured payload."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "sess-1", "STU001",
            "PC-01", "LAB-1", "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z", "MON-10-11",
        )
        for key in ["report_id", "session_id", "student_id", "machine_id",
                     "lab_id", "hour_start", "hour_end", "date",
                     "timetable_slot", "summary", "agent_version", "generated_at"]:
            self.assertIn(key, payload, f"Missing top-level key: {key}")

        self.assertIn("app_usage", payload["summary"])
        self.assertIn("behavior", payload["summary"])
        print("  [PASS] Summary payload has correct structure with all required fields")

    def test_apps_sorted_by_duration(self):
        """App usage list is sorted by active_duration descending."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "s1", "STU001",
            "PC-01", "LAB-1", "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        apps = payload["summary"]["app_usage"]
        durations = [a["active_duration"] for a in apps]
        self.assertEqual(durations, sorted(durations, reverse=True))
        self.assertEqual(apps[0]["app_name"], "code.exe")
        print("  [PASS] Apps are sorted by active_duration descending")

    def test_behavior_fields(self):
        """Behavior section has all input and time fields."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "s1", "STU001",
            "PC-01", "LAB-1", "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        behavior = payload["summary"]["behavior"]
        self.assertEqual(behavior["keyboard_count"], 4500)
        self.assertEqual(behavior["mouse_click_count"], 350)
        self.assertEqual(behavior["mouse_move_count"], 12000)
        self.assertEqual(behavior["active_time"], 3600)
        self.assertEqual(behavior["idle_time"], 200)
        print("  [PASS] Behavior section contains correct input and time data")

    def test_idempotency_key(self):
        """report_id is composed of session_id # hour_start."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "sess-ABC",
            "STU001", "PC-01", "LAB-1",
            "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        self.assertEqual(payload["report_id"], "sess-ABC#2026-07-20T10:00:00Z")
        print("  [PASS] report_id serves as correct idempotency key")

    def test_privacy_check_blocks_disallowed_in_payload(self):
        """_assert_no_disallowed_fields blocks disallowed keys in assembled payload."""
        from summarizer import _assert_no_disallowed_fields
        # These should all raise ValueError
        for bad_key in ["keystrokes", "screenshot", "clipboard", "window_title", "url", "password"]:
            with self.assertRaises(ValueError, msg=f"Key '{bad_key}' should be blocked"):
                _assert_no_disallowed_fields({bad_key: "bad_value"})
        print("  [PASS] _assert_no_disallowed_fields blocks all disallowed keys")

    def test_privacy_check_blocks_nested(self):
        """Disallowed keys nested inside dicts/lists are also blocked."""
        from summarizer import _assert_no_disallowed_fields
        # Nested in dict
        with self.assertRaises(ValueError):
            _assert_no_disallowed_fields({"summary": {"keystrokes": [1, 2, 3]}})
        # Nested in list of dicts
        with self.assertRaises(ValueError):
            _assert_no_disallowed_fields({"items": [{"url": "http://secret.com"}]})
        print("  [PASS] Privacy check catches disallowed keys in nested structures")

    def test_clean_payload_passes_privacy(self):
        """A properly built payload passes the privacy check without error."""
        from summarizer import build_summary
        # This should NOT raise - clean snapshot
        payload = build_summary(
            self._sample_snapshot(), "s1", "STU001", "PC-01", "LAB-1",
            "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        # If we got here, the privacy check inside build_summary passed
        self.assertIn("summary", payload)
        print("  [PASS] Clean payload passes privacy check without errors")

    def test_build_summary_only_picks_safe_fields(self):
        """build_summary extracts only safe fields from snapshot; extra fields are ignored."""
        from summarizer import build_summary
        snapshot = self._sample_snapshot()
        # Add dangerous extra fields to the snapshot - these should be ignored
        snapshot["some_random_extra"] = "not_included"

        payload = build_summary(
            snapshot, "s1", "STU001", "PC-01", "LAB-1",
            "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        # The extra field should NOT appear in the assembled payload
        payload_str = json.dumps(payload)
        self.assertNotIn("some_random_extra", payload_str)
        print("  [PASS] build_summary only includes safe fields from snapshot")

    def test_hour_boundary(self):
        """hour_boundary returns correct ISO strings for start and end of hour."""
        from summarizer import hour_boundary
        test_time = time.strptime("2026-07-20T14:35:22", "%Y-%m-%dT%H:%M:%S")
        start, end = hour_boundary(test_time)
        self.assertEqual(start, "2026-07-20T14:00:00Z")
        self.assertEqual(end, "2026-07-20T15:00:00Z")
        print("  [PASS] hour_boundary returns correct hour start/end")

    def test_date_field_extracted(self):
        """Payload date field is YYYY-MM-DD extracted from hour_start."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "s1", "STU001", "PC-01", "LAB-1",
            "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        self.assertEqual(payload["date"], "2026-07-20")
        print("  [PASS] Date field correctly extracted from hour_start")

    def test_timetable_slot_default(self):
        """Timetable slot defaults to NONE when not provided."""
        from summarizer import build_summary
        payload = build_summary(
            self._sample_snapshot(), "s1", "STU001", "PC-01", "LAB-1",
            "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z",
        )
        self.assertEqual(payload["timetable_slot"], "NONE")
        print("  [PASS] Timetable slot defaults to NONE")


# ===========================================================================
#  5. UPLOADER TESTS
# ===========================================================================
class TestUploader(unittest.TestCase):
    """Tests for uploader.py - upload, offline queue, retry."""

    def _make_config(self):
        return {
            "api_base_url": "https://test-api.example.com/v1",
            "api_key": "test-key",
            "retry_interval_minutes": 1,
        }

    def _sample_payload(self, report_id="rpt-001"):
        return {
            "report_id": report_id,
            "session_id": "sess-1",
            "student_id": "STU001",
            "machine_id": "PC-01",
            "lab_id": "LAB-1",
            "summary": {"app_usage": [], "behavior": {}},
        }

    def _cleanup(self, uploader, db_path):
        """Close Uploader's internal SQLite connection, then delete the temp DB file."""
        try:
            uploader._conn.close()
        except Exception:
            pass
        try:
            os.unlink(db_path)
        except Exception:
            pass

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_successful_upload(self, mock_post, mock_db):
        """Successful upload calls API correctly."""
        from uploader import Uploader
        mock_post.return_value = MagicMock(status_code=200)
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.upload_summary(self._sample_payload())
            mock_post.assert_called_once()
            print("  [PASS] Successful upload calls API correctly")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_failed_upload_queues(self, mock_post, mock_db):
        """Failed upload queues the payload in SQLite."""
        from uploader import Uploader
        mock_post.return_value = MagicMock(status_code=500, text="Error")
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.upload_summary(self._sample_payload("rpt-queue-test"))

            # Read from the Uploader's own connection to avoid locking issues
            rows = u._conn.execute("SELECT report_id, payload FROM pending_summaries").fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "rpt-queue-test")
            queued_data = json.loads(rows[0][1])
            self.assertEqual(queued_data["report_id"], "rpt-queue-test")
            print("  [PASS] Failed upload correctly queues payload in SQLite")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_network_error_queues(self, mock_post, mock_db):
        """Network errors (ConnectionError) queue for retry."""
        from uploader import Uploader
        import requests as req
        mock_post.side_effect = req.exceptions.ConnectionError("No network")
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.upload_summary(self._sample_payload("rpt-offline"))

            rows = u._conn.execute("SELECT COUNT(*) FROM pending_summaries").fetchone()
            self.assertEqual(rows[0], 1)
            print("  [PASS] Network error correctly queues payload for retry")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_flush_queue_on_reconnect(self, mock_post, mock_db):
        """Queued payloads are flushed when network comes back."""
        from uploader import Uploader
        import requests as req

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        mock_post.side_effect = req.exceptions.ConnectionError("No net")
        u = Uploader(self._make_config())
        try:
            u.upload_summary(self._sample_payload("rpt-retry"))

            mock_post.side_effect = None
            mock_post.return_value = MagicMock(status_code=200)
            u._flush_queue()

            rows = u._conn.execute("SELECT COUNT(*) FROM pending_summaries").fetchone()
            self.assertEqual(rows[0], 0, "Queue should be empty after successful flush")
            print("  [PASS] Queued payloads flushed successfully on reconnect")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_session_end_sent(self, mock_post, mock_db):
        """Session end event is sent with correct payload."""
        from uploader import Uploader
        mock_post.return_value = MagicMock(status_code=200)
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.send_session_end("sess-1", "2026-07-20T15:00:00Z", 3600)
            call_kwargs = mock_post.call_args
            sent = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            self.assertEqual(sent["session_id"], "sess-1")
            self.assertEqual(sent["total_duration"], 3600)
            print("  [PASS] Session end event sent with correct payload")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_idempotent_queue(self, mock_post, mock_db):
        """Duplicate report_id replaces existing entry (no duplicates)."""
        from uploader import Uploader
        import requests as req
        mock_post.side_effect = req.exceptions.ConnectionError("No net")
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.upload_summary(self._sample_payload("rpt-dup"))
            u.upload_summary(self._sample_payload("rpt-dup"))

            rows = u._conn.execute("SELECT COUNT(*) FROM pending_summaries WHERE report_id='rpt-dup'").fetchone()
            self.assertEqual(rows[0], 1, "Duplicate report_id should be replaced, not duplicated")
            print("  [PASS] Idempotent queue: duplicate report_id correctly replaced")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    def test_headers_include_auth(self, mock_db):
        """Headers include API key and Bearer token."""
        from uploader import Uploader
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.set_session_token("my-session-token")
            headers = u._headers()
            self.assertEqual(headers["x-api-key"], "test-key")
            self.assertEqual(headers["Authorization"], "Bearer my-session-token")
            self.assertEqual(headers["Content-Type"], "application/json")
            print("  [PASS] Headers include API key, Bearer token, and Content-Type")
        finally:
            self._cleanup(u, f.name)

    @patch("uploader._db_path")
    @patch("uploader.requests.post")
    def test_retry_loop_starts_and_stops(self, mock_post, mock_db):
        """Retry loop thread starts and stops cleanly."""
        from uploader import Uploader
        mock_post.return_value = MagicMock(status_code=200)
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            mock_db.return_value = f.name

        u = Uploader(self._make_config())
        try:
            u.start_retry_loop()
            self.assertTrue(u._running)
            self.assertIsNotNone(u._retry_thread)
            u.stop()
            self.assertFalse(u._running)
            print("  [PASS] Retry loop starts and stops cleanly")
        finally:
            self._cleanup(u, f.name)


# ===========================================================================
#  6. INTEGRATION / LIFECYCLE TESTS
# ===========================================================================
class TestSessionLifecycle(unittest.TestCase):
    """Integration-level tests for the session lifecycle in main.py."""

    def test_seconds_to_next_hour(self):
        """_seconds_to_next_hour returns a value in (0, 3600]."""
        from main import _seconds_to_next_hour
        secs = _seconds_to_next_hour()
        self.assertGreater(secs, 0)
        self.assertLessEqual(secs, 3600)
        print("  [PASS] _seconds_to_next_hour returns value in (0, 3600]")

    def test_full_data_pipeline(self):
        """End-to-end: tracker -> snapshot -> summarizer -> payload validation."""
        from tracker import ActivityTracker
        from summarizer import build_summary, hour_boundary

        t = ActivityTracker()
        t._app_seconds["chrome.exe"] = 600.0
        t._app_seconds["python.exe"] = 1800.0
        t._app_opens["chrome.exe"] = 2
        t._app_opens["python.exe"] = 1
        t._keyboard_count = 3000
        t._mouse_click_count = 200
        t._mouse_move_count = 8000
        t._active_seconds = 2200.0
        t._idle_seconds = 400.0

        snap = t.snapshot_and_reset()
        self.assertEqual(len(snap["app_usage"]), 2)

        h_start, h_end = hour_boundary()
        payload = build_summary(
            snap, "sess-e2e", "STU001",
            "PC-01", "LAB-1", h_start, h_end, "MON-14-15",
        )

        self.assertEqual(payload["session_id"], "sess-e2e")
        self.assertEqual(payload["student_id"], "STU001")
        self.assertEqual(payload["timetable_slot"], "MON-14-15")
        self.assertEqual(len(payload["summary"]["app_usage"]), 2)
        self.assertEqual(payload["summary"]["app_usage"][0]["app_name"], "python.exe")
        self.assertEqual(payload["summary"]["app_usage"][0]["active_duration"], 1800)

        json_str = json.dumps(payload)
        reparsed = json.loads(json_str)
        self.assertEqual(reparsed["report_id"], payload["report_id"])

        print("  [PASS] Full pipeline: tracker -> snapshot -> summarizer -> valid JSON")

    def test_tracker_reset_isolation(self):
        """After snapshot, new data doesn't mix with old."""
        from tracker import ActivityTracker

        t = ActivityTracker()
        t._app_seconds["app1.exe"] = 100.0
        t._keyboard_count = 50
        snap1 = t.snapshot_and_reset()

        t._app_seconds["app2.exe"] = 200.0
        t._keyboard_count = 80
        snap2 = t.snapshot_and_reset()

        self.assertIn("app1.exe", snap1["app_usage"])
        self.assertNotIn("app2.exe", snap1["app_usage"])
        self.assertIn("app2.exe", snap2["app_usage"])
        self.assertNotIn("app1.exe", snap2["app_usage"])
        self.assertEqual(snap1["keyboard_count"], 50)
        self.assertEqual(snap2["keyboard_count"], 80)
        print("  [PASS] Hourly snapshot isolation: no data leakage between periods")


# ===========================================================================
#  7. PRIVACY COMPREHENSIVE TESTS
# ===========================================================================
class TestPrivacyComprehensive(unittest.TestCase):
    """Comprehensive privacy tests across the entire agent."""

    def test_all_disallowed_keys_blocked(self):
        """Every key in DISALLOWED_KEYS is blocked by _assert_no_disallowed_fields."""
        from summarizer import DISALLOWED_KEYS, _assert_no_disallowed_fields
        for key in DISALLOWED_KEYS:
            with self.assertRaises(ValueError, msg=f"Key '{key}' should be blocked"):
                _assert_no_disallowed_fields({key: "test_value"})
        print(f"  [PASS] All {len(DISALLOWED_KEYS)} disallowed keys blocked")

    def test_tracker_has_no_key_capture(self):
        """Tracker source code does not capture key values."""
        tracker_path = os.path.join(AGENT_SRC, "tracker.py")
        with open(tracker_path, "r", encoding="utf-8") as f:
            source = f.read()
        self.assertIn("_keyboard_count += 1", source)
        self.assertNotIn("key.char", source)
        self.assertNotIn("key_value", source)
        print("  [PASS] Tracker source code verified: no key value capture mechanism")

    def test_payload_serializable(self):
        """Final payload is JSON-serializable (no binary data leaks)."""
        from summarizer import build_summary
        snapshot = {
            "app_usage": {"test.exe": {"active_duration": 60, "open_count": 1}},
            "keyboard_count": 10,
            "mouse_click_count": 5,
            "mouse_move_count": 100,
            "active_time": 60,
            "idle_time": 0,
        }
        payload = build_summary(snapshot, "s1", "STU001", "PC-01", "LAB-1",
                                "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z")
        json_str = json.dumps(payload)
        self.assertIsInstance(json_str, str)
        self.assertGreater(len(json_str), 10)
        print("  [PASS] Payload is fully JSON-serializable with no binary data")

    def test_no_password_in_final_payload(self):
        """Password is never present in summary payloads."""
        from summarizer import build_summary
        snapshot = {
            "app_usage": {"test.exe": {"active_duration": 60, "open_count": 1}},
            "keyboard_count": 10,
            "mouse_click_count": 5,
            "mouse_move_count": 100,
            "active_time": 60,
            "idle_time": 0,
        }
        payload = build_summary(snapshot, "s1", "STU001", "PC-01", "LAB-1",
                                "2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z")
        payload_str = json.dumps(payload).lower()
        self.assertNotIn("password", payload_str)
        print("  [PASS] No password field in final payload")


# ===========================================================================
#  RUNNER
# ===========================================================================
if __name__ == "__main__":
    print("=" * 70)
    print("  LabPulse Agent -- Feature Test Suite")
    print("  Testing: Config | Auth | Tracker | Summarizer | Uploader | Lifecycle")
    print("=" * 70)
    print()

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    test_classes = [
        TestConfig,
        TestAuth,
        TestTracker,
        TestSummarizer,
        TestUploader,
        TestSessionLifecycle,
        TestPrivacyComprehensive,
    ]

    for cls in test_classes:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Summary
    print()
    print("=" * 70)
    total = result.testsRun
    failures = len(result.failures) + len(result.errors)
    passed = total - failures
    if failures == 0:
        print(f"  ALL {total} TESTS PASSED -- All agent features verified!")
    else:
        print(f"  {passed}/{total} passed, {failures} failed")
        for fail in result.failures + result.errors:
            print(f"     FAILED: {fail[0]}")
    print("=" * 70)
