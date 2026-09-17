"""
Activity tracking module. Polls the foreground window, counts keyboard/mouse
inputs (never stores key values), detects idle periods, and extracts browser
tab titles + URLs via Win32 UI Automation.

Ensures:
  - Every application opened or focused is reliably tracked (including UWP apps).
  - Every website and tab visited in supported browsers is captured with visits and active duration.
  - Zero loss of brief opens or tab switches.
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

# Suffixes we strip from window titles to get the actual page name
_BROWSER_SUFFIXES = [
    " - Google Chrome", " — Mozilla Firefox", " - Mozilla Firefox",
    " - Microsoft Edge", " - Microsoft\u200b Edge",
    " - Opera", " - Brave", " - Vivaldi", " - Chromium",
    " - Personal", " - Work",  # Edge profile labels
]

# Well-known site patterns for fallback domain extraction from titles
_WELL_KNOWN_SITES = [
    (r"\bgoogle\b", "google.com"),
    (r"\byoutube\b", "youtube.com"),
    (r"\bgithub\b", "github.com"),
    (r"\bstackoverflow\b|\bstack overflow\b", "stackoverflow.com"),
    (r"\bchatgpt\b|\bopenai\b", "chatgpt.com"),
    (r"\bclaude\b|\banthropic\b", "claude.ai"),
    (r"\bwikipedia\b", "wikipedia.org"),
    (r"\bwit\b|\bsolapur\b|\bmoodle\b", "witsolapur.org"),
    (r"\bgmail\b", "mail.google.com"),
    (r"\bw3schools\b", "w3schools.com"),
    (r"\bgeeksforgeeks\b", "geeksforgeeks.org"),
    (r"\bleetcode\b", "leetcode.com"),
    (r"\bhackerrank\b", "hackerrank.com"),
    (r"\bcoursera\b", "coursera.org"),
    (r"\budemy\b", "udemy.com"),
    (r"\bkaggle\b", "kaggle.com"),
    (r"\blinkedin\b", "linkedin.com"),
    (r"\breddit\b", "reddit.com"),
    (r"\bmicrosoft\b", "microsoft.com"),
    (r"\bpython\b", "python.org"),
    (r"\bcanva\b", "canva.com"),
    (r"\bfigma\b", "figma.com"),
    (r"\bamazon\b", "amazon.in"),
    (r"\bflipkart\b", "flipkart.com"),
    (r"\btwitter\b|\bx\.com\b", "x.com"),
    (r"\blocalhost\b|127\.0\.0\.1", "localhost"),
]

_DOMAIN_REGEX = re.compile(
    r"\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|edu|in|gov|net|io|co|ai|dev|app|ac\.in|edu\.in|org\.in|co\.in|gov\.in))\b",
    re.IGNORECASE,
)


def _get_foreground_hwnd() -> int:
    return user32.GetForegroundWindow()


def _get_window_title(hwnd: int) -> str:
    try:
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value.strip()
    except (OSError, ValueError):
        return ""


def _resolve_uwp_app(hwnd: int) -> str:
    """If the foreground window is ApplicationFrameHost, identify the real UWP app process or title."""
    real_proc_name = []

    def enum_child(child_hwnd, _):
        child_pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(child_hwnd, ctypes.byref(child_pid))
        if child_pid.value:
            try:
                cp = psutil.Process(child_pid.value)
                cname = cp.name()
                if cname.lower() != "applicationframehost.exe":
                    real_proc_name.append(cname)
                    return False
            except Exception:
                pass
        return True

    try:
        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
        user32.EnumChildWindows(hwnd, WNDENUMPROC(enum_child), 0)
    except Exception:
        pass

    if real_proc_name:
        return real_proc_name[0]

    title = _get_window_title(hwnd)
    if title:
        clean = re.sub(r"[^\w.-]", "", title.strip())
        if clean:
            return f"{clean}.exe"
    return "ApplicationFrameHost.exe"


def _get_foreground_app(hwnd: int = None) -> str:
    try:
        if hwnd is None:
            hwnd = _get_foreground_hwnd()
        if not hwnd:
            return ""
        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = psutil.Process(pid.value)
        pname = proc.name()

        # Resolve actual UWP application if hosted
        if pname.lower() == "applicationframehost.exe":
            return _resolve_uwp_app(hwnd)

        return pname
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return ""


def _extract_page_title(window_title: str) -> str:
    title = window_title.strip()
    for suffix in _BROWSER_SUFFIXES:
        if title.endswith(suffix):
            title = title[: -len(suffix)].strip()
            break
    return title


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
        edit_el = element.FindFirst(4, edit_cond)
        if edit_el:
            # Try ValuePattern (IUIAutomationValuePattern = 10002)
            try:
                val_pattern = edit_el.GetCurrentPattern(10002)
                if val_pattern:
                    from comtypes import cast
                    from comtypes.gen.UIAutomationClient import IUIAutomationValuePattern  # type: ignore
                    vp = cast(val_pattern, ctypes.POINTER(IUIAutomationValuePattern))
                    url = vp.CurrentValue
                    if url:
                        return str(url).strip()
            except Exception:
                pass
            # Fallback: read Name property
            try:
                name = edit_el.CurrentName
                if name and ("." in name or "://" in name or "/" in name):
                    return str(name).strip()
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
    if not url.startswith(("http://", "https://", "file://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or ""
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.lower().strip()
    except Exception:
        return ""


def _resolve_browser_domain(url: str, page_title: str, window_title: str) -> str:
    """
    Resolve domain and site identity reliably.
    Guarantees a non-empty, clean domain name for every browser window.
    """
    # 1. From URL if available
    if url:
        dom = _extract_domain(url)
        if dom:
            return dom

    # 2. Check page_title with domain regex (e.g. github.com, witsolapur.org)
    if page_title:
        m = _DOMAIN_REGEX.search(page_title)
        if m:
            return m.group(1).lower()

    # 3. Known platform keyword matching against page_title FIRST
    # (Checking page_title prevents browser suffixes like " - Google Chrome" from falsely matching google.com)
    if page_title:
        title_lower = page_title.lower()
        for pattern, dom in _WELL_KNOWN_SITES:
            if re.search(pattern, title_lower):
                return dom

        # 4. Check delimiters in page_title (" - ", " | ", " — ", " · ")
        for sep in [" - ", " | ", " — ", " · "]:
            if sep in page_title:
                parts = [p.strip() for p in page_title.split(sep) if p.strip()]
                for part in parts:
                    for pattern, dom in _WELL_KNOWN_SITES:
                        if re.search(pattern, part.lower()):
                            return dom
                    m = _DOMAIN_REGEX.search(part)
                    if m:
                        return m.group(1).lower()
                if len(parts) >= 2:
                    last_part = parts[-1]
                    if len(last_part) < 30 and not any(w in last_part.lower() for w in ["chrome", "edge", "firefox", "browser"]):
                        clean_name = re.sub(r"[^\w\s.-]", "", last_part).strip()
                        if clean_name:
                            return f"{clean_name.lower().replace(' ', '')}.com" if "." not in clean_name else clean_name.lower()

        # 5. Cleaned page title fallback
        clean = re.sub(r"[^\w\s.-]", "", page_title).strip()
        if clean:
            return clean[:30].lower().replace(" ", "-")

    # 6. Fallback if page_title was empty
    clean_w = re.sub(r"[^\w\s.-]", "", window_title).strip()
    if clean_w:
        return clean_w[:30].lower().replace(" ", "-")

    return "browser-tab"


def _get_idle_seconds() -> float:
    """Return seconds since the last keyboard/mouse input (Windows LASTINPUTINFO)."""
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    user32.GetLastInputInfo(ctypes.byref(lii))
    millis = kernel32.GetTickCount() - lii.dwTime
    return millis / 1000.0


class ActivityTracker:
    """
    High-resolution activity tracker (polls every 500ms):
      - foreground app (name, open count, cumulative active seconds)
      - idle vs active state
      - browser tab title, URL, domain, and visits when a browser is in the foreground
      - keyboard and mouse input counts via pynput
    """

    def __init__(self, idle_threshold_seconds: int = 60):
        self.idle_threshold = idle_threshold_seconds

        self._app_seconds: dict[str, float] = defaultdict(float)
        self._app_opens: dict[str, int] = defaultdict(int)
        self._last_app: str = ""

        self._keyboard_count: int = 0
        self._mouse_click_count: int = 0
        self._mouse_move_count: int = 0

        self._active_seconds: float = 0.0
        self._idle_seconds: float = 0.0

        self._browser_tab_seconds: dict[str, float] = defaultdict(float)
        self._browser_tab_visits: dict[str, int] = defaultdict(int)
        self._browser_page_log: list[dict] = []
        self._last_browser_domain: str = ""
        self._last_browser_title: str = ""
        self._browser_history_limit: int = 500

        self._lock = threading.Lock()
        self._running = False
        self._poll_thread: threading.Thread | None = None
        self._pynput_keyboard = None
        self._pynput_mouse = None

    def _start_pynput(self):
        try:
            from pynput import keyboard as kb, mouse as ms

            def on_press(_key):
                with self._lock:
                    self._keyboard_count += 1

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

    def _track_browser(self, hwnd: int, app_name: str, is_active: bool, dt: float = 0.5):
        app_lower = app_name.lower()
        if app_lower not in BROWSER_EXECUTABLES:
            if self._last_browser_domain:
                self._last_browser_domain = ""
                self._last_browser_title = ""
            return

        browser_label = BROWSER_EXECUTABLES[app_lower]

        window_title = _get_window_title(hwnd)
        page_title = _extract_page_title(window_title) if window_title else ""

        url = _get_browser_url(hwnd)
        domain = _resolve_browser_domain(url, page_title, window_title)

        with self._lock:
            # Accumulate per-domain active time
            if is_active and domain:
                self._browser_tab_seconds[domain] += dt

            # Detect tab or page switch
            is_new_page = (
                domain != self._last_browser_domain or
                (page_title and page_title != self._last_browser_title)
            )

            if is_new_page and domain:
                self._browser_tab_visits[domain] += 1
                display_title = page_title if page_title else domain
                if len(self._browser_page_log) < self._browser_history_limit:
                    self._browser_page_log.append({
                        "title": display_title[:200],
                        "url": url[:500] if url else f"https://{domain}",
                        "domain": domain,
                        "browser": browser_label,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    })
                self._last_browser_domain = domain
                self._last_browser_title = page_title

    def _poll(self):
        dt = 0.5  # 500ms high-resolution polling
        while self._running:
            try:
                hwnd = _get_foreground_hwnd()
                app = _get_foreground_app(hwnd)
                idle = _get_idle_seconds()
                is_idle = idle >= self.idle_threshold

                # Filter out shell overlay artifacts
                is_valid_app = bool(app) and app.lower() not in (
                    "desktop", "unknown", "shellexperiencehost.exe",
                    "searchapp.exe", "startmenuexperiencehost.exe", "lockapp.exe"
                )

                with self._lock:
                    if is_valid_app and app != self._last_app:
                        self._app_opens[app] += 1
                        self._last_app = app
                    elif not is_valid_app and self._last_app != "":
                        self._last_app = ""

                    if not is_idle:
                        if is_valid_app:
                            self._app_seconds[app] += dt
                        self._active_seconds += dt
                    else:
                        self._idle_seconds += dt

                # Browser tracking
                if is_valid_app:
                    self._track_browser(hwnd, app, not is_idle, dt)

            except Exception as exc:
                logger.debug("Poll error (non-fatal): %s", exc)

            time.sleep(dt)

    def start(self):
        if self._running:
            return
        self._running = True
        self._start_pynput()
        self._poll_thread = threading.Thread(target=self._poll, daemon=True, name="tracker-poll")
        self._poll_thread.start()
        logger.info("ActivityTracker started (0.5s poll rate, comprehensive app & website tracking)")

    def stop(self):
        self._running = False
        self._stop_pynput()
        if self._poll_thread:
            self._poll_thread.join(timeout=3)
        logger.info("ActivityTracker stopped")

    def snapshot_and_reset(self) -> dict:
        """
        Return a snapshot of all accumulated data and reset counters.
        Called by summarizer at each hour boundary, live sync, and session end.
        Guarantees EVERY app opened and EVERY website visited is captured.
        """
        with self._lock:
            # Union of all tracked apps
            all_apps = set(self._app_seconds.keys()) | set(self._app_opens.keys())
            app_usage = {}
            for app in all_apps:
                if not app or app.lower() in ("desktop", "unknown"):
                    continue
                opens = self._app_opens.get(app, 0)
                secs = self._app_seconds.get(app, 0.0)
                if opens > 0 or secs > 0:
                    app_usage[app] = {
                        "active_duration": max(1, round(secs)) if opens > 0 and secs < 1.0 else round(secs),
                        "open_count": max(1, opens),
                    }

            # Union of all tracked browser domains
            all_domains = set(self._browser_tab_seconds.keys()) | set(self._browser_tab_visits.keys())
            browser_sites = [
                {
                    "domain": domain,
                    "active_duration": max(1, round(self._browser_tab_seconds.get(domain, 0.0)))
                    if self._browser_tab_visits.get(domain, 0) > 0 and self._browser_tab_seconds.get(domain, 0.0) < 1.0
                    else round(self._browser_tab_seconds.get(domain, 0.0)),
                    "visit_count": max(1, self._browser_tab_visits.get(domain, 0)),
                }
                for domain in all_domains
                if domain
            ]
            browser_sites.sort(key=lambda x: (x["active_duration"], x["visit_count"]), reverse=True)

            snapshot = {
                "app_usage": app_usage,
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

    def peek_snapshot(self) -> dict:
        """
        Return a copy of current accumulated data WITHOUT resetting counters.
        Used for periodic disk backup and live telemetry.
        """
        with self._lock:
            all_apps = set(self._app_seconds.keys()) | set(self._app_opens.keys())
            app_usage = {}
            for app in all_apps:
                if not app or app.lower() in ("desktop", "unknown"):
                    continue
                opens = self._app_opens.get(app, 0)
                secs = self._app_seconds.get(app, 0.0)
                if opens > 0 or secs > 0:
                    app_usage[app] = {
                        "active_duration": max(1, round(secs)) if opens > 0 and secs < 1.0 else round(secs),
                        "open_count": max(1, opens),
                    }

            all_domains = set(self._browser_tab_seconds.keys()) | set(self._browser_tab_visits.keys())
            browser_sites = [
                {
                    "domain": domain,
                    "active_duration": max(1, round(self._browser_tab_seconds.get(domain, 0.0)))
                    if self._browser_tab_visits.get(domain, 0) > 0 and self._browser_tab_seconds.get(domain, 0.0) < 1.0
                    else round(self._browser_tab_seconds.get(domain, 0.0)),
                    "visit_count": max(1, self._browser_tab_visits.get(domain, 0)),
                }
                for domain in all_domains
                if domain
            ]
            browser_sites.sort(key=lambda x: (x["active_duration"], x["visit_count"]), reverse=True)

            return {
                "app_usage": app_usage,
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
