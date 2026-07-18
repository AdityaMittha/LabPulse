"""
tracker.py — Activity tracking for the LabPulse Windows agent.
Tracks foreground apps, keyboard/mouse COUNTS ONLY (no key values), and idle time.
Walchand Institute of Technology, Solapur

PRIVACY GUARANTEE:
  - pynput listener counts keypresses only; key values are NEVER recorded.
  - Mouse listener counts clicks and movement events only.
  - No screenshots, no window text, no clipboard access.
"""
import ctypes
import ctypes.wintypes
import logging
import threading
import time
from collections import defaultdict

import psutil

logger = logging.getLogger(__name__)

# ─── Windows API helpers ────────────────────────────────────────────────────

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32


def _get_foreground_app() -> str:
    """Return the executable name of the current foreground window's process."""
    try:
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return "Desktop"
        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = psutil.Process(pid.value)
        return proc.name()
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return "Unknown"


def _get_idle_seconds() -> float:
    """Return seconds since the last keyboard/mouse input (Windows LASTINPUTINFO)."""
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    user32.GetLastInputInfo(ctypes.byref(lii))
    millis = kernel32.GetTickCount() - lii.dwTime
    return millis / 1000.0


# ─── ActivityTracker ────────────────────────────────────────────────────────

class ActivityTracker:
    """
    Polls every second:
      - foreground app (name + cumulative active seconds)
      - idle vs active state

    pynput listeners run in background threads and increment counters only.
    """

    def __init__(self, idle_threshold_seconds: int = 60):
        self.idle_threshold = idle_threshold_seconds

        # Per-app accumulated seconds (reset each hour by summarizer)
        self._app_seconds: dict[str, float] = defaultdict(float)
        self._app_opens: dict[str, int] = defaultdict(int)
        self._last_app: str = ""

        # Input counters (counts only — no key values ever)
        self._keyboard_count: int = 0
        self._mouse_click_count: int = 0
        self._mouse_move_count: int = 0

        # Time accumulators
        self._active_seconds: float = 0.0
        self._idle_seconds: float = 0.0

        self._lock = threading.Lock()
        self._running = False
        self._poll_thread: threading.Thread | None = None
        self._pynput_keyboard = None
        self._pynput_mouse = None

    # ── pynput listeners ────────────────────────────────────────────────────

    def _start_pynput(self):
        try:
            from pynput import keyboard as kb, mouse as ms

            def on_press(_key):
                with self._lock:
                    self._keyboard_count += 1  # count only — key value DISCARDED

            def on_click(_x, _y, _button, pressed):
                if pressed:
                    with self._lock:
                        self._mouse_click_count += 1

            def on_move(_x, _y):
                with self._lock:
                    self._mouse_move_count += 1

            self._pynput_keyboard = kb.Listener(on_press=on_press, suppress=False)
            self._pynput_mouse = ms.Listener(on_click=on_click, on_move=on_move)
            self._pynput_keyboard.start()
            self._pynput_mouse.start()
            logger.info("pynput listeners started (counts only, no key values stored)")
        except Exception as exc:
            logger.warning("pynput unavailable: %s — input counts will be 0", exc)

    def _stop_pynput(self):
        for listener in (self._pynput_keyboard, self._pynput_mouse):
            if listener:
                try:
                    listener.stop()
                except Exception:
                    pass

    # ── Poll loop ───────────────────────────────────────────────────────────

    def _poll(self):
        while self._running:
            try:
                app = _get_foreground_app()
                idle = _get_idle_seconds()
                is_idle = idle >= self.idle_threshold

                with self._lock:
                    if app != self._last_app:
                        if app:
                            self._app_opens[app] += 1
                        self._last_app = app

                    if not is_idle:
                        self._app_seconds[app] += 1.0
                        self._active_seconds += 1.0
                    else:
                        self._idle_seconds += 1.0

            except Exception as exc:
                logger.debug("Poll error (non-fatal): %s", exc)

            time.sleep(1.0)

    # ── Public API ──────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._start_pynput()
        self._poll_thread = threading.Thread(target=self._poll, daemon=True, name="tracker-poll")
        self._poll_thread.start()
        logger.info("ActivityTracker started")

    def stop(self):
        self._running = False
        self._stop_pynput()
        if self._poll_thread:
            self._poll_thread.join(timeout=3)
        logger.info("ActivityTracker stopped")

    def snapshot_and_reset(self) -> dict:
        """
        Return a snapshot of all accumulated data and reset counters.
        Called by summarizer at each hour boundary and at session end.
        """
        with self._lock:
            snapshot = {
                "app_usage": {
                    app: {
                        "active_duration": round(secs),
                        "open_count": self._app_opens.get(app, 0),
                    }
                    for app, secs in self._app_seconds.items()
                    if secs > 0
                },
                "keyboard_count": self._keyboard_count,
                "mouse_click_count": self._mouse_click_count,
                "mouse_move_count": self._mouse_move_count,
                "active_time": round(self._active_seconds),
                "idle_time": round(self._idle_seconds),
            }
            # Reset
            self._app_seconds.clear()
            self._app_opens.clear()
            self._keyboard_count = 0
            self._mouse_click_count = 0
            self._mouse_move_count = 0
            self._active_seconds = 0.0
            self._idle_seconds = 0.0

        return snapshot
