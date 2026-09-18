"""
LabPulse agent entry point.

Normal mode (no args):
  1. Drain offline queue (summaries + pending session-end from last boot)
  2. Show PNR login prompt
  3. Save pending_session.json immediately after login
  4. Run background tracking until shutdown

Shutdown-sync mode (--shutdown-sync):
  Called by Windows Task Scheduler just before shutdown.
  1. Take final tracking snapshot
  2. Build and upload summary
  3. Send session-end (with SQLite fallback)
  4. Write pending_session.json if sync failed
  5. Exit immediately so Windows can continue shutdown

The student is ALWAYS logged out on PC shutdown — there is no manual logout.
"""

import atexit
import logging
import os
import sys
import threading
import time
import uuid

# ── Logging ──────────────────────────────────────────────────────────────────
log_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"labpulse_{time.strftime('%Y%m%d')}.log")

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("labpulse.main")

from config        import get_config
from auth          import validate_pnr, AuthResult
from tracker       import ActivityTracker
from summarizer    import build_summary, hour_boundary
from uploader      import Uploader
from offline_store import (
    save_pending_session,
    load_pending_session,
    clear_pending_session,
    save_pending_snapshot,
    load_pending_snapshot,
    clear_pending_snapshot,
    drain_on_boot,
)


# ── Login window ──────────────────────────────────────────────────────────────

def show_pnr_login(config: dict, max_attempts: int = 3) -> AuthResult:
    """
    Display a full-screen, unminimizeable, always-on-top student login kiosk window.
    Returns AuthResult. The student cannot minimize, bypass, or close the window
    until entering valid credentials or exhausting attempts.
    """
    import tkinter as tk
    from tkinter import ttk

    result_holder: list[AuthResult] = []

    root = tk.Tk()
    root.title("LabPulse — Student Lab Session Sign-in")

    # 1. True Full-Screen, Always-on-Top, and Unminimizeable
    root.attributes("-fullscreen", True)
    root.attributes("-topmost", True)
    root.resizable(False, False)
    root.configure(bg="#0F172A")  # Modern deep slate canvas

    # 2. Block window close / minimize / taskbar switching
    root.protocol("WM_DELETE_WINDOW", lambda: None)

    def enforce_kiosk_focus(event=None):
        try:
            root.attributes("-fullscreen", True)
            root.attributes("-topmost", True)
            root.lift()
            root.focus_force()
        except Exception:
            pass

    root.bind("<FocusOut>", lambda e: root.after(60, enforce_kiosk_focus))
    root.bind("<Escape>",   lambda e: "break")       # Disable Esc exiting fullscreen
    root.bind("<Alt-F4>",   lambda e: "break")       # Block Alt+F4

    # ── Style ──────────────────────────────────────────────────────────────────
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("Primary.TButton",
                    background="#2563EB", foreground="white",
                    font=("Segoe UI", 11, "bold"), padding=11,
                    relief="flat", borderwidth=0)
    style.map("Primary.TButton",
              background=[("active", "#1D4ED8"), ("disabled", "#93C5FD")])

    attempts  = [0]
    error_var = tk.StringVar()

    # ── Centered Card on Fullscreen Canvas ─────────────────────────────────────
    center_container = tk.Frame(root, bg="#0F172A")
    center_container.place(relx=0.5, rely=0.5, anchor="center")

    # Card outer border / shadow outline
    card_border = tk.Frame(center_container, bg="#334155", padx=1, pady=1)
    card_border.pack()

    card = tk.Frame(card_border, bg="#FFFFFF", width=480, padx=0, pady=0)
    card.pack()

    # ── Card Header ────────────────────────────────────────────────────────────
    hdr = tk.Frame(card, bg="#1E40AF", height=88)
    hdr.pack(fill="x")
    tk.Label(hdr, text="🎓  Walchand Institute of Technology, Solapur",
             bg="#1E40AF", fg="white",
             font=("Segoe UI", 12, "bold")).pack(pady=(14, 2))
    tk.Label(hdr, text="LabPulse • Student Workstation Kiosk",
             bg="#1E40AF", fg="#BFDBFE",
             font=("Segoe UI", 9)).pack(pady=(0, 10))

    # Machine info strip
    info = tk.Frame(card, bg="#EFF6FF", pady=6, padx=16)
    info.pack(fill="x")
    tk.Label(info,
             text=f"🖥️ PC: {config.get('machine_id','?')}   •   🏢 Lab: {config.get('lab_name', config.get('lab_id','?'))}",
             bg="#EFF6FF", fg="#1E40AF",
             font=("Segoe UI", 9, "bold")).pack()

    # ── Form ───────────────────────────────────────────────────────────────────
    form = tk.Frame(card, bg="#FFFFFF", padx=36, pady=22)
    form.pack(fill="both", expand=True)

    tk.Label(form, text="Student ID / PNR Number",
             bg="#FFFFFF", fg="#0F172A",
             font=("Segoe UI", 10, "bold"), anchor="w").grid(row=0, column=0, sticky="w")
    pnr_var   = tk.StringVar()
    pnr_entry = ttk.Entry(form, textvariable=pnr_var, width=32,
                          font=("Segoe UI", 11))
    pnr_entry.grid(row=1, column=0, pady=(4, 14), sticky="ew")

    tk.Label(form, text="Password",
             bg="#FFFFFF", fg="#0F172A",
             font=("Segoe UI", 10, "bold"), anchor="w").grid(row=2, column=0, sticky="w")
    pw_var   = tk.StringVar()
    pw_entry = ttk.Entry(form, textvariable=pw_var, show="•", width=32,
                         font=("Segoe UI", 11))
    pw_entry.grid(row=3, column=0, pady=(4, 14), sticky="ew")

    form.columnconfigure(0, weight=1)

    err_lbl = tk.Label(form, textvariable=error_var,
                       bg="#FFFFFF", fg="#DC2626",
                       font=("Segoe UI", 9), wraplength=400, anchor="w")
    err_lbl.grid(row=4, column=0, pady=(0, 6), sticky="w")

    def attempt_login():
        pnr      = pnr_var.get().strip()
        password = pw_var.get()
        if not pnr or not password:
            error_var.set("Please enter both PNR number and password.")
            return

        btn.configure(state="disabled", text="Verifying Credentials…")
        root.update()

        auth = validate_pnr(pnr, password, config)

        if auth.success:
            result_holder.append(auth)
            root.destroy()
            return

        if auth.error == "OFFLINE":
            # Network down — allow offline session with PENDING_VALIDATION student ID
            result_holder.append(AuthResult(
                success=False,
                student_id="PENDING_VALIDATION",
                error="OFFLINE",
            ))
            root.destroy()
            return

        attempts[0] += 1
        remaining = max_attempts - attempts[0]
        if remaining <= 0:
            error_var.set("Too many failed attempts. Workstation unlocking as unidentified.")
            result_holder.append(AuthResult(
                success=False,
                student_id="UNIDENTIFIED",
                error="MAX_ATTEMPTS",
            ))
            root.after(2000, root.destroy)
        else:
            error_var.set(f"{auth.error}  ({remaining} attempt{'s' if remaining > 1 else ''} left)")
            btn.configure(state="normal", text="Unlock & Start Lab Session")
            pw_var.set("")
            pw_entry.focus()

    btn = ttk.Button(form, text="Unlock & Start Lab Session",
                     style="Primary.TButton", command=attempt_login)
    btn.grid(row=5, column=0, pady=(8, 4), sticky="ew")

    # Security & compliance badge
    footer_notice = tk.Label(
        card,
        text="🔒 Workstation activity is automatically logged for attendance & compliance.",
        bg="#F8FAFC", fg="#64748B", font=("Segoe UI", 8), pady=8
    )
    footer_notice.pack(fill="x")

    pnr_entry.focus()
    pnr_entry.bind("<Return>", lambda _: pw_entry.focus())
    pw_entry.bind("<Return>",  lambda _: attempt_login())
    btn.bind("<Return>",       lambda _: attempt_login())

    root.mainloop()

    return result_holder[0] if result_holder else AuthResult(
        success=False, student_id="UNIDENTIFIED", error="CLOSED"
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seconds_to_next_hour() -> float:
    now = time.gmtime()
    return 3600 - (now.tm_min * 60 + now.tm_sec)


# ── Shutdown-sync mode ────────────────────────────────────────────────────────

def _start_windows_shutdown_watcher(on_shutdown_fn):
    """
    Hooks Windows shutdown via two complementary mechanisms:
    1. A hidden Win32 top-level window message loop that intercepts WM_QUERYENDSESSION
       and WM_ENDSESSION before Windows cuts the network or kills processes.
       Uses ShutdownBlockReasonCreate to hold Windows until sync completes.
    2. win32api.SetConsoleCtrlHandler for console-mode shutdown events.
    """
    # 1. Console Control Handler (works when run from CLI / Terminal / Batch)
    try:
        import win32api
        import win32con

        def _console_handler(ctrl_type):
            if ctrl_type in (win32con.CTRL_SHUTDOWN_EVENT, win32con.CTRL_LOGOFF_EVENT, win32con.CTRL_CLOSE_EVENT):
                logger.info("Windows console shutdown event received (type=%d). Starting pre-shutdown cloud sync...", ctrl_type)
                on_shutdown_fn(reason=f"CONSOLE_{ctrl_type}")
                return True
            return False

        win32api.SetConsoleCtrlHandler(_console_handler, True)
        logger.debug("Console control handler registered.")
    except Exception as exc:
        logger.debug("Could not register console control handler: %s", exc)

    # 2. Hidden Window Message Loop (for WM_QUERYENDSESSION & WM_ENDSESSION)
    try:
        import win32gui
        import win32con
        import ctypes

        def _message_loop():
            def wnd_proc(hwnd, msg, wparam, lparam):
                if msg == win32con.WM_QUERYENDSESSION:
                    logger.info("Windows is shutting down (WM_QUERYENDSESSION intercepted). Starting pre-shutdown cloud sync...")
                    try:
                        ctypes.windll.user32.ShutdownBlockReasonCreate(
                            hwnd, ctypes.c_wchar_p("LabPulse is syncing lab session data to cloud...")
                        )
                    except Exception:
                        pass
                    try:
                        on_shutdown_fn(reason="WM_QUERYENDSESSION")
                    finally:
                        try:
                            ctypes.windll.user32.ShutdownBlockReasonDestroy(hwnd)
                        except Exception:
                            pass
                    return 1  # Tell Windows we are ready

                elif msg == win32con.WM_ENDSESSION:
                    if wparam:  # True = shutdown proceeding
                        logger.info("Windows WM_ENDSESSION received.")
                        on_shutdown_fn(reason="WM_ENDSESSION")
                    return 0

                return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

            wc = win32gui.WNDCLASS()
            wc.lpfnWndProc = wnd_proc
            wc.lpszClassName = "LabPulseShutdownInterceptor"
            hinst = win32gui.GetModuleHandle(None)
            wc.hInstance = hinst
            try:
                class_atom = win32gui.RegisterClass(wc)
            except Exception:
                class_atom = win32gui.GetClassInfo(hinst, "LabPulseShutdownInterceptor")

            hwnd = win32gui.CreateWindow(
                "LabPulseShutdownInterceptor", "LabPulseShutdownWatcher",
                0, 0, 0, 0, 0,
                0, 0, hinst, None
            )
            logger.info("Windows shutdown interceptor active (HWND=%s)", hwnd)
            win32gui.PumpMessages()

        watcher_thread = threading.Thread(target=_message_loop, daemon=True, name="shutdown-watcher")
        watcher_thread.start()
    except Exception as exc:
        logger.warning("Could not register Win32 shutdown window interceptor: %s", exc)


def run_shutdown_sync():
    """
    Called by Windows Task Scheduler on every PC shutdown.
    Reads the pending_session.json, sends final data, and exits quickly.
    Windows will NOT complete shutdown until this process exits (max ~5s).
    """
    config  = get_config()
    pending = load_pending_session()

    if not pending:
        logger.info("Shutdown sync: no pending session found, nothing to do.")
        sys.exit(0)

    logger.info("Shutdown sync: session=%s student=%s",
                pending["session_id"], pending["student_id"])

    uploader = Uploader(config)
    # No session token available at shutdown — use machine API key only
    uploader.set_session_token("")

    logout_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    login_ts    = _parse_ts(pending.get("login_time", logout_time))
    logout_ts   = _parse_ts(logout_time)
    total       = max(0, int(logout_ts - login_ts))

    # ── Upload final summary from pending snapshot if available ────────────────
    snapshot = load_pending_snapshot()
    if snapshot:
        try:
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot,
                pending["session_id"],
                pending["student_id"],
                pending["machine_id"],
                pending["lab_id"],
                hour_start,
                hour_end,
                pending.get("timetable_slot", "NONE"),
            )
            ok_sum = uploader._post(uploader.summary_url, payload, timeout=4)
            if not ok_sum:
                uploader._enqueue_summary(payload)
            clear_pending_snapshot()
            logger.info("Shutdown sync: final activity summary uploaded")
        except Exception as exc:
            logger.warning("Shutdown sync: could not upload summary: %s", exc)

    # ── Try to send session-end ────────────────────────────────────────────────
    ok = uploader.send_session_end_with_fallback(
        pending["session_id"], logout_time, total, timeout=4
    )

    if ok:
        logger.info("Shutdown sync: session-end sent successfully (duration: %ds)", total)
        clear_pending_session()
    else:
        logger.warning("Shutdown sync: offline — session-end queued, pending_session.json kept for next boot")

    # Final offline queue flush attempt
    try:
        uploader._flush_queue()
    except Exception as exc:
        logger.debug("Shutdown sync flush error: %s", exc)

    logger.info("Shutdown sync complete. Exiting.")
    sys.exit(0)


def run_sync_now():
    """
    Manually triggers an immediate cloud sync:
    1. Flushes offline queue (summaries + pending session-ends)
    2. Sends machine heartbeat
    3. Samples current activity and uploads a summary
    """
    config = get_config()
    logger.info("Manual cloud sync requested for machine %s...", config.get("machine_id"))
    uploader = Uploader(config)

    # Send heartbeat
    uploader.send_heartbeat(config["machine_id"])
    logger.info("Heartbeat sent.")

    # Flush pending offline data
    uploader._flush_queue()
    logger.info("Offline queue flushed.")

    # Quick sample and upload
    tracker = ActivityTracker(idle_threshold_seconds=config.get("idle_threshold_seconds", 60))
    try:
        tracker._start_pynput()
    except Exception:
        tracker._start_pynput = lambda: None
    tracker.start()
    time.sleep(2)
    snapshot = tracker.snapshot_and_reset()
    tracker.stop()

    pending = load_pending_session()
    sess_id = pending["session_id"] if pending else str(uuid.uuid4())
    stud_id = pending["student_id"] if pending else "MANUAL_SYNC"
    slot    = pending.get("timetable_slot", "NONE") if pending else "NONE"

    hour_start, hour_end = hour_boundary()
    payload = build_summary(
        snapshot, sess_id, stud_id,
        config["machine_id"], config["lab_id"],
        hour_start, hour_end, slot,
    )
    uploader.upload_summary(payload)
    logger.info("Summary uploaded with report_id=%s", payload["report_id"])
    print(f"Data successfully sent to cloud! Report ID: {payload['report_id']}")
    sys.exit(0)


def _parse_ts(ts_str: str) -> float:
    try:
        return time.mktime(time.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ"))
    except (ValueError, TypeError):
        return time.time()


# ── Normal session mode ───────────────────────────────────────────────────────

def run_session():
    config = get_config()
    logger.info("LabPulse agent starting — machine=%s lab=%s",
                config["machine_id"], config["lab_id"])

    # ── Step 1: Boot-time offline drain ──────────────────────────────────────
    logger.info("Boot: initialising uploader for offline drain…")
    uploader = Uploader(config)
    drain_on_boot(uploader, timeout_seconds=config.get("boot_drain_timeout_seconds", 45))

    # ── Step 2: PNR Login ─────────────────────────────────────────────────────
    auth = show_pnr_login(config, max_attempts=config.get("max_validate_attempts", 3))

    student_id     = auth.student_id or "UNIDENTIFIED"
    student_name   = auth.student_name or "Unknown"
    session_token  = auth.session_token
    timetable_slot = auth.timetable_slot if auth.success else "NONE"

    # Use session_id from backend if available (backend created the session record)
    session_id  = auth.session_id or str(uuid.uuid4())
    login_time  = auth.login_time or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    logger.info("Session started: id=%s student=%s (%s) slot=%s",
                session_id, student_id, student_name, timetable_slot)

    # ── Step 3: Persist session so shutdown-sync can recover it ──────────────
    save_pending_session(
        session_id     = session_id,
        student_id     = student_id,
        student_name   = student_name,
        login_time     = login_time,
        machine_id     = config["machine_id"],
        lab_id         = config["lab_id"],
        timetable_slot = timetable_slot,
    )

    # ── Step 4: Start tracking ─────────────────────────────────────────────────
    tracker = ActivityTracker(idle_threshold_seconds=config.get("idle_threshold_seconds", 60))
    uploader.set_session_token(session_token)
    tracker.start()
    uploader.start_retry_loop()
    # Send an immediate heartbeat on login so the dashboard shows this machine online,
    # then continue sending every heartbeat_interval (default 8 min).
    uploader.send_heartbeat(config["machine_id"], session_id)
    uploader.start_heartbeat_loop(config["machine_id"], session_id)

    # Periodically backup in-memory activity to disk (every 15s) so shutdown-sync never loses data
    stop_saver = threading.Event()
    def _snapshot_saver():
        while not stop_saver.is_set():
            time.sleep(15)
            try:
                save_pending_snapshot(tracker.peek_snapshot())
            except Exception as exc:
                logger.debug("Periodic snapshot save error: %s", exc)

    saver_thread = threading.Thread(target=_snapshot_saver, daemon=True, name="snapshot-saver")
    saver_thread.start()

    # Periodically stream live telemetry to cloud (every 15s) so dashboard reflects real-time apps
    stop_live_sync = threading.Event()
    def _live_sync_loop():
        live_interval = config.get("live_sync_interval_seconds", 15)
        # Initial push after 5s so dashboard gets telemetry right after login
        time.sleep(5)
        try:
            snap = tracker.peek_snapshot()
            if snap.get("app_usage") or snap.get("active_time", 0) > 0:
                hour_start, hour_end = hour_boundary()
                payload = build_summary(
                    snap, session_id, student_id,
                    config["machine_id"], config["lab_id"],
                    hour_start, hour_end, timetable_slot,
                )
                uploader._post(uploader.summary_url, payload)
                logger.info("Initial real-time telemetry synced (%d apps)", len(snap.get("app_usage", {})))
        except Exception as exc:
            logger.debug("Initial live sync error: %s", exc)

        while not stop_live_sync.is_set():
            time.sleep(live_interval)
            try:
                snap = tracker.peek_snapshot()
                if snap.get("app_usage") or snap.get("active_time", 0) > 0:
                    hour_start, hour_end = hour_boundary()
                    payload = build_summary(
                        snap, session_id, student_id,
                        config["machine_id"], config["lab_id"],
                        hour_start, hour_end, timetable_slot,
                    )
                    uploader._post(uploader.summary_url, payload)
                    logger.debug("Live telemetry synced (%d apps, %ds active)",
                                 len(snap.get("app_usage", {})), snap.get("active_time", 0))
            except Exception as exc:
                logger.debug("Live sync error: %s", exc)

    live_thread = threading.Thread(target=_live_sync_loop, daemon=True, name="live-telemetry-sync")
    live_thread.start()
    logger.info("Real-time telemetry streaming started (interval=%ds)", config.get("live_sync_interval_seconds", 15))

    # ── Step 5: Graceful shutdown & session finalization handler ──────────────
    session_ended_lock = threading.Lock()
    session_ended = [False]
    shutdown_event = threading.Event()

    def end_session_and_sync(reason: str = "normal"):
        """
        Unified handler that finalizes the session and flushes all pending data to cloud.
        Triggered by:
          1. Windows shutdown / restart / logoff (WM_QUERYENDSESSION / WM_ENDSESSION)
          2. Windows console shutdown / close (win32api.SetConsoleCtrlHandler)
          3. Process exit (atexit hook)
        Guaranteed to execute exactly once before the PC powers off.
        """
        with session_ended_lock:
            if session_ended[0]:
                return
            session_ended[0] = True

        logger.info("Ending session %s (reason: %s)...", session_id, reason)
        shutdown_event.set()

        try:
            stop_saver.set()
            stop_live_sync.set()
        except Exception:
            pass

        # 1. Snapshot and stop tracker
        try:
            snapshot = tracker.snapshot_and_reset()
            tracker.stop()
        except Exception as exc:
            logger.debug("Tracker stop error: %s", exc)
            snapshot = load_pending_snapshot() or {"app_usage": {}, "active_time": 0}

        logout_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        login_ts    = _parse_ts(login_time)
        logout_ts   = _parse_ts(logout_time)
        total       = max(0, int(logout_ts - login_ts))

        # 2. Upload final summary to AWS with short timeout (5s)
        try:
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot, session_id, student_id,
                config["machine_id"], config["lab_id"],
                hour_start, hour_end, timetable_slot,
            )
            # Direct post to ensure cloud gets it before network tears down
            uploaded = uploader._post(uploader.summary_url, payload, timeout=5)
            if not uploaded:
                uploader._enqueue_summary(payload)
            clear_pending_snapshot()
            logger.info("Pre-shutdown activity summary synced (apps: %d)", len(snapshot.get("app_usage", {})))
        except Exception as exc:
            logger.warning("Could not upload final summary on shutdown: %s", exc)

        # 3. Finalize session in DynamoDB (logout_time + total_duration)
        try:
            ok = uploader.send_session_end_with_fallback(session_id, logout_time, total, timeout=5)
            if ok:
                logger.info("Session %s finalized on cloud (duration: %ds)", session_id, total)
                clear_pending_session()
            else:
                logger.warning("Session-end network call timed out/failed; queued in offline DB")
        except Exception as exc:
            logger.warning("Session-end call error on shutdown: %s", exc)

        # 4. Final queue flush
        try:
            uploader._flush_queue()
        except Exception:
            pass

        try:
            uploader.stop()
        except Exception:
            pass

        logger.info("Session shutdown sync sequence completed.")

    # Register exit handlers
    atexit.register(lambda: end_session_and_sync("atexit"))
    _start_windows_shutdown_watcher(end_session_and_sync)

    # ── Step 6: Hourly summary loop ───────────────────────────────────────────
    summary_interval = config.get("summary_interval_minutes", 60) * 60
    while not shutdown_event.is_set():
        wait = min(_seconds_to_next_hour(), summary_interval)
        if shutdown_event.wait(wait):
            break

        try:
            snapshot   = tracker.snapshot_and_reset()
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot, session_id, student_id,
                config["machine_id"], config["lab_id"],
                hour_start, hour_end, timetable_slot,
            )
            uploader.upload_summary(payload)
        except Exception as exc:
            logger.exception("Error generating/uploading hourly summary: %s", exc)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--shutdown-sync" in sys.argv:
        run_shutdown_sync()
    elif "--sync-now" in sys.argv:
        run_sync_now()
    else:
        run_session()
