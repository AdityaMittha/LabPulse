"""
live_tracker_demo.py — Live demo: shows which apps/tasks the agent detects on YOUR machine.
Runs the ActivityTracker for ~10 seconds and prints what it captures.

Usage:  python live_tracker_demo.py
"""
import os
import sys
import time

# Ensure agent src is importable
AGENT_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
sys.path.insert(0, AGENT_SRC)

from tracker import ActivityTracker, _get_foreground_app, _get_idle_seconds

DURATION = 10  # seconds to track

def main():
    print("=" * 65)
    print("  LabPulse Agent -- Live Tracker Demo")
    print("  Tracking your apps for %d seconds... switch windows to see!" % DURATION)
    print("=" * 65)
    print()

    # --- Quick single check ---
    current_app = _get_foreground_app()
    idle = _get_idle_seconds()
    print("  [NOW] Foreground app : %s" % current_app)
    print("  [NOW] Idle seconds   : %.1f" % idle)
    print()

    # --- Start tracker ---
    tracker = ActivityTracker(idle_threshold_seconds=5)
    # Mock pynput to avoid issues if not installed / no permissions
    try:
        tracker._start_pynput()
        pynput_ok = True
    except Exception:
        pynput_ok = False
        tracker._start_pynput = lambda: None

    tracker.start()

    print("  Tracking started... (switch between apps to generate data)")
    print()

    # Show live foreground app every second
    for i in range(DURATION):
        app = _get_foreground_app()
        idle_s = _get_idle_seconds()
        status = "IDLE" if idle_s >= 5 else "ACTIVE"
        print("  [%2d/%d] App: %-35s  Status: %s  (idle: %.0fs)" % (
            i + 1, DURATION, app, status, idle_s))
        time.sleep(1)

    # --- Snapshot ---
    snapshot = tracker.snapshot_and_reset()
    tracker.stop()

    print()
    print("=" * 65)
    print("  RESULTS -- Apps/Tasks Detected in %d seconds" % DURATION)
    print("=" * 65)
    print()

    # App usage table
    app_usage = snapshot["app_usage"]
    if app_usage:
        print("  %-35s  %10s  %10s" % ("APP / TASK", "DURATION", "OPENS"))
        print("  " + "-" * 60)
        # Sort by duration descending
        sorted_apps = sorted(app_usage.items(),
                             key=lambda x: x[1]["active_duration"],
                             reverse=True)
        for app_name, info in sorted_apps:
            dur = info["active_duration"]
            opens = info["open_count"]
            print("  %-35s  %8ds  %8dx" % (app_name, dur, opens))
    else:
        print("  (No app usage detected -- was the machine idle?)")

    print()
    print("  --- Input Activity ---")
    print("  Keyboard presses : %d" % snapshot["keyboard_count"])
    print("  Mouse clicks     : %d" % snapshot["mouse_click_count"])
    print("  Mouse movements  : %d" % snapshot["mouse_move_count"])
    print()
    print("  --- Time Breakdown ---")
    print("  Active time      : %ds" % snapshot["active_time"])
    print("  Idle time        : %ds" % snapshot["idle_time"])
    print()

    if pynput_ok:
        print("  [INFO] pynput was active -- keyboard/mouse counts are real")
    else:
        print("  [INFO] pynput not available -- keyboard/mouse counts are 0")

    print()
    print("=" * 65)
    print("  Demo complete! This is exactly what the agent tracks hourly.")
    print("=" * 65)


if __name__ == "__main__":
    main()
