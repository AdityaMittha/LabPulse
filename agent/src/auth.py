"""Validates student PNR credentials against the backend API."""

import logging
import requests
import time

logger = logging.getLogger(__name__)


class AuthResult:
    def __init__(self, success: bool, student_id: str = "", student_name: str = "",
                 session_id: str = "", session_token: str = "",
                 timetable_slot: str = "NONE", login_time: str = "", error: str = ""):
        self.success       = success
        self.student_id    = student_id
        self.student_name  = student_name
        self.session_id    = session_id          # returned by backend on success
        self.session_token = session_token
        self.timetable_slot = timetable_slot
        self.login_time    = login_time
        self.error         = error


def validate_pnr(pnr_no: str, password: str, config: dict) -> AuthResult:
    """
    Send PNR credentials to /v1/agent/validate.
    The backend hashes and verifies the password — it is NEVER stored locally.
    Returns an AuthResult with session_id and session_token on success.
    """
    url = f"{config['api_base_url']}/agent/validate"
    headers = {
        "x-api-key":    config["api_key"],
        "Content-Type": "application/json",
    }
    payload = {
        "pnr_no":     pnr_no.strip(),
        "password":   password,
        "machine_id": config["machine_id"],
        "lab_id":     config["lab_id"],
        "timestamp":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            return AuthResult(
                success       = True,
                student_id    = data.get("student_id", ""),
                student_name  = data.get("student_name", ""),
                session_id    = data.get("session_id", ""),
                session_token = data.get("session_token", ""),
                timetable_slot = data.get("timetable_slot", "NONE"),
                login_time    = data.get("login_time", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
            )
        elif resp.status_code == 401:
            try:
                msg = resp.json().get("error", "Invalid PNR or password.")
            except Exception:
                msg = "Invalid PNR or password."
            return AuthResult(success=False, error=msg)
        elif resp.status_code == 403:
            return AuthResult(success=False, error="Machine not registered. Contact lab admin.")
        else:
            return AuthResult(success=False, error=f"Server error ({resp.status_code}). Try again.")

    except requests.exceptions.ConnectionError:
        logger.warning("Network unavailable during PNR validation — offline mode")
        return AuthResult(success=False, error="OFFLINE")
    except requests.exceptions.Timeout:
        logger.warning("Validation request timed out")
        return AuthResult(success=False, error="Request timed out. Check network and retry.")
    except Exception as exc:
        logger.exception("Unexpected error during validation: %s", exc)
        return AuthResult(success=False, error="Unexpected error. See logs.")


# Legacy alias — kept for backward compatibility with any older code
def validate_college_id(college_id: str, password: str, config: dict) -> AuthResult:
    """Deprecated: use validate_pnr() instead. Calls validate_pnr internally."""
    return validate_pnr(college_id, password, config)
