"""
main.py — LabPulse Windows Agent entry point.
Walchand Institute of Technology, Solapur

Flow:
  1. Load config
  2. Show college ID login prompt (tkinter)
  3. Validate credentials via backend API (LDAP/AD)
  4. Start activity tracker
  5. Summarize + upload on each hour boundary
  6. On Windows logout/shutdown → final summary + session-end
"""
import atexit
import logging
import os
import sys
import threading
import time
import uuid

# ── Logging setup ────────────────────────────────────────────────────────────
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"labpulse_{time.strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("labpulse.main")

from config import get_config
from auth import validate_college_id, AuthResult
from tracker import ActivityTracker
from summarizer import build_summary, hour_boundary
from uploader import Uploader


# ─── Login Prompt (tkinter) ──────────────────────────────────────────────────

def show_login_prompt(config: dict, max_attempts: int = 3) -> AuthResult:
    """
    Display a small always-on-top tkinter window for college ID sign-in.
    Returns AuthResult after success, 3 failures, or offline detection.
    """
    import tkinter as tk
    from tkinter import ttk

    result_holder: list[AuthResult] = []

    root = tk.Tk()
    root.title("LabPulse — Lab Session Sign-in")
    root.geometry("380x260")
    root.resizable(False, False)
    root.attributes("-topmost", True)
    root.configure(bg="#F8FAFC")

    # Centre on screen
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 380) // 2
    y = (root.winfo_screenheight() - 260) // 2
    root.geometry(f"380x260+{x}+{y}")

    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("Blue.TButton", background="#2563EB", foreground="white",
                    font=("Inter", 10, "bold"), padding=8)
    style.map("Blue.TButton", background=[("active", "#1D4ED8")])

    attempts = [0]
    error_var = tk.StringVar()

    # ── Header ──
    header = tk.Frame(root, bg="#2563EB", height=56)
    header.pack(fill="x")
    tk.Label(header, text="🎓  Walchand Institute of Technology",
             bg="#2563EB", fg="white", font=("Inter", 10, "bold")).pack(pady=6)
    tk.Label(header, text="Lab Session Sign-in  •  LabPulse",
             bg="#2563EB", fg="#BFDBFE", font=("Inter", 9)).pack()

    # ── Form ──
    form = tk.Frame(root, bg="#F8FAFC", padx=28, pady=16)
    form.pack(fill="both", expand=True)

    tk.Label(form, text="College ID", bg="#F8FAFC", fg="#0F172A",
             font=("Inter", 9, "bold"), anchor="w").grid(row=0, column=0, sticky="w")
    id_var = tk.StringVar()
    id_entry = ttk.Entry(form, textvariable=id_var, width=30, font=("Courier", 10))
    id_entry.grid(row=1, column=0, pady=(2, 10), sticky="ew")

    tk.Label(form, text="Password", bg="#F8FAFC", fg="#0F172A",
             font=("Inter", 9, "bold"), anchor="w").grid(row=2, column=0, sticky="w")
    pw_var = tk.StringVar()
    pw_entry = ttk.Entry(form, textvariable=pw_var, show="•", width=30, font=("Courier", 10))
    pw_entry.grid(row=3, column=0, pady=(2, 10), sticky="ew")

    form.columnconfigure(0, weight=1)

    err_label = tk.Label(form, textvariable=error_var, bg="#F8FAFC",
                         fg="#DC2626", font=("Inter", 9), wraplength=320, anchor="w")
    err_label.grid(row=4, column=0, sticky="w")

    def attempt_login():
        college_id = id_var.get().strip()
        password = pw_var.get()
        if not college_id or not password:
            error_var.set("Please enter both College ID and password.")
            return

        btn.configure(state="disabled", text="Verifying…")
        root.update()

        auth = validate_college_id(college_id, password, config)

        if auth.success:
            result_holder.append(auth)
            root.destroy()
            return

        if auth.error == "OFFLINE":
            # Offline mode — continue without student ID
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

    btn = ttk.Button(form, text="Start Session", style="Blue.TButton", command=attempt_login)
    btn.grid(row=5, column=0, pady=(8, 0), sticky="ew")

    id_entry.focus()
    pw_entry.bind("<Return>", lambda _: attempt_login())
    btn.bind("<Return>", lambda _: attempt_login())

    root.mainloop()

    if not result_holder:
        # Window was closed by user
        return AuthResult(success=False, student_id="UNIDENTIFIED", error="CLOSED")
    return result_holder[0]


# ─── Hour-boundary scheduler ─────────────────────────────────────────────────

def _seconds_to_next_hour() -> float:
    now = time.gmtime()
    return 3600 - (now.tm_min * 60 + now.tm_sec)


# ─── Main session lifecycle ───────────────────────────────────────────────────

def run_session():
    config = get_config()
    logger.info("LabPulse agent starting — machine=%s lab=%s", config["machine_id"], config["lab_id"])

    # 1. Login prompt
    auth = show_login_prompt(config, max_attempts=config.get("max_validate_attempts", 3))
    student_id = auth.student_id or "UNIDENTIFIED"
    session_token = auth.session_token
    timetable_slot = auth.timetable_slot if auth.success else "NONE"

    session_id = str(uuid.uuid4())
    login_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    logger.info("Session started: id=%s student=%s slot=%s", session_id, student_id, timetable_slot)

    # 2. Start tracker + uploader
    tracker = ActivityTracker(idle_threshold_seconds=config.get("idle_threshold_seconds", 60))
    uploader = Uploader(config)
    uploader.set_session_token(session_token)
    tracker.start()
    uploader.start_retry_loop()

    # 3. Register cleanup on exit (Windows shutdown / logout)
    def on_exit():
        try:
            logger.info("Session ending (exit hook)")
            snapshot = tracker.snapshot_and_reset()
            tracker.stop()
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot, session_id, student_id,
                config["machine_id"], config["lab_id"],
                hour_start, hour_end, timetable_slot,
            )
            uploader.upload_summary(payload)
            logout_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            login_ts = time.mktime(time.strptime(login_time, "%Y-%m-%dT%H:%M:%SZ"))
            logout_ts = time.mktime(time.strptime(logout_time, "%Y-%m-%dT%H:%M:%SZ"))
            total = int(logout_ts - login_ts)
            uploader.send_session_end(session_id, logout_time, total)
            uploader.stop()
        except Exception as exc:
            logger.exception("Error in exit hook: %s", exc)

    atexit.register(on_exit)

    # 4. Hourly summary loop
    summary_interval = config.get("summary_interval_minutes", 60) * 60
    while True:
        wait = min(_seconds_to_next_hour(), summary_interval)
        time.sleep(wait)

        try:
            snapshot = tracker.snapshot_and_reset()
            hour_start, hour_end = hour_boundary()
            payload = build_summary(
                snapshot, session_id, student_id,
                config["machine_id"], config["lab_id"],
                hour_start, hour_end, timetable_slot,
            )
            uploader.upload_summary(payload)
        except Exception as exc:
            logger.exception("Error generating/uploading hourly summary: %s", exc)


if __name__ == "__main__":
    run_session()
