"""
auth.py — College ID validation for the LabPulse agent.
Authenticates against the backend API (which in turn uses LDAP/AD).
Walchand Institute of Technology, Solapur
"""
import logging
import requests
import time

logger = logging.getLogger(__name__)


class AuthResult:
    def __init__(self, success: bool, student_id: str = "", session_token: str = "",
                 timetable_slot: str = "NONE", error: str = ""):
        self.success = success
        self.student_id = student_id
        self.session_token = session_token
        self.timetable_slot = timetable_slot
        self.error = error


def validate_college_id(college_id: str, password: str, config: dict) -> AuthResult:
    """
    Send college credentials to /v1/agent/validate.
    The backend verifies against LDAP/AD and returns a session token.
    Credentials are NEVER stored locally — only the session token is kept.
    """
    url = f"{config['api_base_url']}/agent/validate"
    headers = {
        "x-api-key": config["api_key"],
        "Content-Type": "application/json",
    }
    payload = {
        "college_login": college_id,
        "password": password,          # sent over HTTPS, not stored after this call
        "machine_id": config["machine_id"],
        "lab_id": config["lab_id"],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return AuthResult(
                success=True,
                student_id=data.get("student_id", ""),
                session_token=data.get("session_token", ""),
                timetable_slot=data.get("timetable_slot", "NONE"),
            )
        elif resp.status_code == 401:
            return AuthResult(success=False, error="Invalid college ID or password.")
        elif resp.status_code == 403:
            return AuthResult(success=False, error="Machine not registered. Contact lab admin.")
        else:
            return AuthResult(success=False, error=f"Server error ({resp.status_code}). Try again.")
    except requests.exceptions.ConnectionError:
        logger.warning("Network unavailable during validation — offline mode")
        return AuthResult(success=False, error="OFFLINE")
    except requests.exceptions.Timeout:
        logger.warning("Validation request timed out")
        return AuthResult(success=False, error="Request timed out. Check network.")
    except Exception as exc:
        logger.exception("Unexpected error during validation: %s", exc)
        return AuthResult(success=False, error="Unexpected error. See logs.")
