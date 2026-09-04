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
    drain_on_boot,
)


# ── Login window ──────────────────────────────────────────────────────────────

def show_pnr_login(config: dict, max_attempts: int = 3) -> AuthResult:
    """
    Display an always-on-top login window asking for PNR No. and password.
    Returns AuthResult.  The window cannot be closed without entering credentials
    or exhausting attempts.
    """
    import tkinter as tk
    from tkinter import ttk

    result_holder: list[AuthResult] = []

    root = tk.Tk()
    root.title("LabPulse — Lab Session Sign-in")
    root.geometry("420x310")
    root.resizable(False, False)
    root.attributes("-topmost", True)
    root.protocol("WM_DELETE_WINDOW", lambda: None)   # prevent close button
    root.configure(bg="#F8FAFC")

    # Centre on screen
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"420x310+{(sw-420)//2}+{(sh-310)//2}")

    # ── Style ──────────────────────────────────────────────────────────────────
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("Primary.TButton",
                    background="#2563EB", foreground="white",
                    font=("Segoe UI", 10, "bold"), padding=9,
                    relief="flat", borderwidth=0)
    style.map("Primary.TButton",
              background=[("active", "#1D4ED8"), ("disabled", "#93C5FD")])

    attempts  = [0]
    error_var = tk.StringVar()

    # ── Header ─────────────────────────────────────────────────────────────────
    hdr = tk.Frame(root, bg="#2563EB", height=68)
    hdr.pack(fill="x")
    tk.Label(hdr, text="🎓  Walchand Institute of Technology",
             bg="#2563EB", fg="white",
             font=("Segoe UI", 11, "bold")).pack(pady=(10, 2))
    tk.Label(hdr, text="Lab Session Sign-in  •  LabPulse",
             bg="#2563EB", fg="#BFDBFE",
             font=("Segoe UI", 9)).pack()

    # Machine info strip
    info = tk.Frame(root, bg="#EFF6FF", pady=4)
    info.pack(fill="x")
    tk.Label(info,
             text=f"Machine: {config.get('machine_id','?')}   |   Lab: {config.get('lab_name', config.get('lab_id','?'))}",
             bg="#EFF6FF", fg="#1E40AF",
             font=("Segoe UI", 8)).pack()

    # ── Form ───────────────────────────────────────────────────────────────────
    form = tk.Frame(root, bg="#F8FAFC", padx=32, pady=18)
    form.pack(fill="both", expand=True)

    tk.Label(form, text="PNR No.",
             bg="#F8FAFC", fg="#0F172A",
             font=("Segoe UI", 9, "bold"), anchor="w").grid(row=0, column=0, sticky="w")
    pnr_var   = tk.StringVar()
    pnr_entry = ttk.Entry(form, textvariable=pnr_var, width=34,
                          font=("Courier New", 10))
    pnr_entry.grid(row=1, column=0, pady=(3, 12), sticky="ew")

    tk.Label(form, text="Password",
             bg="#F8FAFC", fg="#0F172A",
             font=("Segoe UI", 9, "bold"), anchor="w").grid(row=2, column=0, sticky="w")
    pw_var   = tk.StringVar()
    pw_entry = ttk.Entry(form, textvariable=pw_var, show="•", width=34,
                         font=("Courier New", 10))
    pw_entry.grid(row=3, column=0, pady=(3, 12), sticky="ew")

    form.columnconfigure(0, weight=1)

    err_lbl = tk.Label(form, textvariable=error_var,
                       bg="#F8FAFC", fg="#DC2626",
                       font=("Segoe UI", 9), wraplength=340, anchor="w")
    err_lbl.grid(row=4, column=0, sticky="w")

    def attempt_login():
        pnr      = pnr_var.get().strip()
        password = pw_var.get()
        if not pnr or not password:
            error_var.set("Please enter both PNR number and password.")
            return

        btn.configure(state="disabled", text="Verifying…")
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
            error_var.set("Too many failed attempts. Session recorded as unidentified.")
            result_holder.append(AuthResult(
                success=False,
                student_id="UNIDENTIFIED",
                error="MAX_ATTEMPTS",
            ))
            root.after(2000, root.destroy)
        else:
            error_var.set(f"{auth.error}  ({remaining} attempt{'s' if remaining > 1 else ''} left)")
            btn.configure(state="normal", text="Start Session")
            pw_var.set("")
            pw_entry.focus()

    btn = ttk.Button(form, text="Start Session",
                     style="Primary.TButton", command=attempt_login)
    btn.grid(row=5, column=0, pady=(6, 0), sticky="ew")

    pnr_entry.focus()
    pw_entry.bind("<Return>", lambda _: attempt_login())
    btn.bind("<Return>",      lambda _: attempt_login())
    root.bind("<Return>",     lambda _: attempt_login())

    root.mainloop()

    return result_holder[0] if result_holder else AuthResult(
        success=False, student_id="UNIDENTIFIED", error="CLOSED"
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seconds_to_next_hour() -> float:
    now = time.gmtime()
    return 3600 - (now.tm_min * 60 + now.tm_sec)


# ── Shutdown-sync mode ────────────────────────────────────────────────────────

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

    # ── Try to send session-end ────────────────────────────────────────────────
    ok = uploader.send_session_end_with_fallback(
        pending["session_id"], logout_time, total
    )

    if ok:
        logger.info("Shutdown sync: session-end sent successfully")
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

    # ── Step 5: atexit hook (fallback for unexpected exits) ───────────────────
    def on_exit():
        """
        Last-resort exit hook. In normal operation the shutdown-sync task runs
        first via Task Scheduler. This catches edge cases (process kill, crash).
        """
        try:
            logger.info("Session ending (atexit hook)")
            snapshot   = tracker.snapshot_and_reset()
            tracker.stop()
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot, session_id, student_id,
                config["machine_id"], config["lab_id"],
                hour_start, hour_end, timetable_slot,
            )
            uploader.upload_summary(payload)

            logout_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            login_ts    = _parse_ts(login_time)
            logout_ts   = _parse_ts(logout_time)
            total       = max(0, int(logout_ts - login_ts))

            ok = uploader.send_session_end_with_fallback(session_id, logout_time, total)
            if ok:
                clear_pending_session()
            uploader.stop()
        except Exception as exc:
            logger.exception("Error in exit hook: %s", exc)

    atexit.register(on_exit)

    # ── Step 6: Hourly summary loop ───────────────────────────────────────────
    summary_interval = config.get("summary_interval_minutes", 60) * 60
    while True:
        wait = min(_seconds_to_next_hour(), summary_interval)
        time.sleep(wait)

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
    else:
        run_session()
