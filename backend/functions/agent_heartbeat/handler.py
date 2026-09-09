"""
agent_heartbeat/handler.py — lightweight endpoint to keep machine last_seen_at current.

Called every ~8 minutes by the lab agent so the dashboard always shows real-time
machine status (● Online / ○ Offline) — not just after hourly summaries.
"""

import json
import os
import time
import boto3
import hashlib

TABLE_PREFIX   = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb       = boto3.resource("dynamodb")
machines_table = dynamodb.Table(f"{TABLE_PREFIX}-Machines")


def _cors(body: dict, status: int = 200) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def _verify_machine_api_key(machine_id: str, api_key: str) -> bool:
    """Check the api_key against the stored key hash in the Machines table."""
    try:
        item = machines_table.get_item(Key={"machine_id": machine_id}).get("Item")
        if not item:
            return False
        stored = item.get("api_key_hash", "")
        return stored == hashlib.sha256(api_key.encode()).hexdigest()
    except Exception:
        return False


def lambda_handler(event, context):
    # Parse and validate
    try:
        body       = json.loads(event.get("body", "{}"))
        machine_id = body.get("machine_id", "").strip()
        if not machine_id:
            return _cors({"error": "machine_id is required"}, 400)
    except (json.JSONDecodeError, Exception) as exc:
        return _cors({"error": f"Bad request: {exc}"}, 400)

    # Verify machine API key (prevents rogue machines sending fake heartbeats)
    api_key = (event.get("headers") or {}).get("x-api-key", "")
    if not _verify_machine_api_key(machine_id, api_key):
        return _cors({"error": "Machine not registered or invalid API key."}, 403)

    now        = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    session_id = body.get("session_id", "")

    # Update last_seen_at (and optionally record the active session_id)
    update_expr = "SET last_seen_at = :t"
    expr_values = {":t": now}

    if session_id:
        update_expr += ", current_session_id = :sid"
        expr_values[":sid"] = session_id

    machines_table.update_item(
        Key={"machine_id": machine_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )

    return _cors({"status": "ok", "machine_id": machine_id, "timestamp": now})
