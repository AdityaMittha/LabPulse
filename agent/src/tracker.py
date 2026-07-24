"""
tracker.py — Activity tracking for the LabPulse Windows agent.
Tracks foreground apps, keyboard/mouse COUNTS ONLY (no key values),
idle time, and browser tab titles/URLs for supported browsers.
Walchand Institute of Technology, Solapur

Browser tracking:
  - Window titles are captured for browser processes to extract page titles.
  - URLs are extracted from the browser address bar via Windows UI Automation.
  - Supported browsers: Chrome, Edge, Firefox, Opera, Brave.
  - Per-site active duration is accumulated alongside page titles.
"""
import ctypes
import ctypes.wintypes
import logging
import re
import threading
import time
from collections import defaultdict
from urllib.parse import urlparse

import psutil

logger = logging.getLogger(__name__)

# ─── Windows API helpers ────────────────────────────────────────────────────

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# Browser executable names (lowercase) → readable label
BROWSER_EXECUTABLES = {
    "chrome.exe":       "Google Chrome",
    "msedge.exe":       "Microsoft Edge",
    "firefox.exe":      "Mozilla Firefox",
    "opera.exe":        "Opera",
    "brave.exe":        "Brave",
    "vivaldi.exe":      "Vivaldi",
    "chromium.exe":     "Chromium",
}

# Browser title suffixes to strip when extracting page title
_BROWSER_SUFFIXES = [
    " - Google Chrome", " — Mozilla Firefox", " - Mozilla Firefox",
    " - Microsoft Edge", " - Microsoft\u200b Edge",
    " - Opera", " - Brave", " - Vivaldi", " - Chromium",
    " - Personal", " - Work",  # Edge profile labels
]


def _get_foreground_hwnd() -> int:
    """Return the HWND of the current foreground window."""
    return user32.GetForegroundWindow()


def _get_foreground_app(hwnd: int = None) -> str:
    """Return the executable name of the current foreground window's process."""
    try:
        if hwnd is None:
            hwnd = _get_foreground_hwnd()
        if not hwnd:
            return "Desktop"
        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = psutil.Process(pid.value)
        return proc.name()
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return "Unknown"


def _get_window_title(hwnd: int) -> str:
    """Return the window title string for a given HWND."""
    try:
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except (OSError, ValueError):
        return ""


def _extract_page_title(window_title: str) -> str:
    """Strip browser suffix from window title to get the page title."""
    title = window_title
    for suffix in _BROWSER_SUFFIXES:
        if title.endswith(suffix):
            title = title[: -len(suffix)]
            break
    return title.strip()


def _get_browser_url(hwnd: int) -> str:
    """
    Extract the URL from a browser's address bar using Windows UI Automation.
    Returns the URL string or empty string on failure.
    """
    try:
        import comtypes.client  # type: ignore

        uia = comtypes.client.CreateObject(
            "{ff48dba4-60ef-4201-aa87-54103eef594e}",
            interface=comtypes.gen.UIAutomationClient.IUIAutomation,  # type: ignore
        )
        element = uia.ElementFromHandle(hwnd)
        if not element:
            return ""

        # UIA_EditControlTypeId = 50004
        edit_cond = uia.CreatePropertyCondition(30003, 50004)
        # Search scope: Descendants = 4
        edit_el = element.FindFirst(4, edit_cond)
        if edit_el:
            # Try ValuePattern (IUIAutomationValuePattern)
            try:
                val_pattern = edit_el.GetCurrentPattern(10002)
                if val_pattern:
                    from comtypes import cast
                    from comtypes.gen.UIAutomationClient import IUIAutomationValuePattern  # type: ignore
                    vp = cast(val_pattern, ctypes.POINTER(IUIAutomationValuePattern))
                    url = vp.CurrentValue
                    if url:
                        return str(url)
            except Exception:
                pass
            # Fallback: read the Name property
            try:
                name = edit_el.CurrentName
                if name and ("." in name or "://" in name):
                    return str(name)
            except Exception:
                pass
    except ImportError:
        logger.debug("comtypes not available — URL extraction disabled (titles still tracked)")
    except Exception as exc:
        logger.debug("UI Automation URL extraction failed: %s", exc)
    return ""


def _extract_domain(url: str) -> str:
    """Extract domain from a URL string. Returns '' if not a valid URL."""
    if not url:
        return ""
    # Prepend scheme if missing
    if not url.startswith(("http://", "https://", "file://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or ""
        # Strip 'www.' prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


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
      - browser tab title, URL, and domain when a browser is in the foreground

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

        # Browser tracking
        self._browser_tab_seconds: dict[str, float] = defaultdict(float)  # domain → seconds
        self._browser_tab_visits: dict[str, int] = defaultdict(int)       # domain → visit count
        self._browser_page_log: list[dict] = []  # [{title, url, domain, browser, timestamp}]
        self._last_browser_domain: str = ""
        self._last_browser_title: str = ""
        self._browser_history_limit: int = 500  # cap log entries per hour

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

    # ── Browser tracking helpers ────────────────────────────────────────────

    def _track_browser(self, hwnd: int, app_name: str, is_active: bool):
        """Extract and record browser tab title, URL, and domain."""
        app_lower = app_name.lower()
        if app_lower not in BROWSER_EXECUTABLES:
            # Not a browser — reset last browser state
            if self._last_browser_domain:
                self._last_browser_domain = ""
                self._last_browser_title = ""
            return

        browser_label = BROWSER_EXECUTABLES[app_lower]

        # Get window title (always available)
        window_title = _get_window_title(hwnd)
        page_title = _extract_page_title(window_title) if window_title else ""

        # Attempt URL extraction via UI Automation
        url = _get_browser_url(hwnd)
        domain = _extract_domain(url)

        # Fallback: try to extract domain from window title if URL extraction failed
        if not domain and page_title:
            # Some titles contain the domain, e.g. "GitHub" or "google.com"
            domain = page_title.split(" - ")[0].strip() if " - " in page_title else ""

        with self._lock:
            # Accumulate per-domain active time
            if domain and is_active:
                self._browser_tab_seconds[domain] += 1.0

            # Detect tab/page change
            if domain != self._last_browser_domain or page_title != self._last_browser_title:
                if domain:
                    self._browser_tab_visits[domain] += 1
                # Log the page visit
                if page_title and len(self._browser_page_log) < self._browser_history_limit:
                    self._browser_page_log.append({
                        "title": page_title[:200],
                        "url": url[:500] if url else "",
                        "domain": domain,
                        "browser": browser_label,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    })
                self._last_browser_domain = domain
                self._last_browser_title = page_title

    # ── Poll loop ───────────────────────────────────────────────────────────

    def _poll(self):
        while self._running:
            try:
                hwnd = _get_foreground_hwnd()
                app = _get_foreground_app(hwnd)
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

                # Browser tracking (outside main lock to avoid holding it during Win API calls)
                self._track_browser(hwnd, app, not is_idle)

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
        logger.info("ActivityTracker started (with browser title/URL tracking)")

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
            # Build browser activity data
            browser_sites = [
                {
                    "domain": domain,
                    "active_duration": round(secs),
                    "visit_count": self._browser_tab_visits.get(domain, 0),
                }
                for domain, secs in sorted(
                    self._browser_tab_seconds.items(),
                    key=lambda x: x[1],
                    reverse=True,
                )
                if secs > 0
            ]

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
                "browser_activity": {
                    "sites": browser_sites,
                    "page_log": list(self._browser_page_log),
                },
            }
            # Reset
            self._app_seconds.clear()
            self._app_opens.clear()
            self._keyboard_count = 0
            self._mouse_click_count = 0
            self._mouse_move_count = 0
            self._active_seconds = 0.0
            self._idle_seconds = 0.0
            self._browser_tab_seconds.clear()
            self._browser_tab_visits.clear()
            self._browser_page_log.clear()
            self._last_browser_domain = ""
            self._last_browser_title = ""

        return snapshot
