"""JSON endpoints consumed by the Next.js command center."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable

from django.core import signing
from django.contrib.auth.hashers import make_password
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from . import blockchain
from .repository import repository
from ..services.inference.live import InferenceConfigurationError, detect_frame
from ..services.evidence.alert_store import get_alert_store
from ..services.evidence.firebase import get_status as firebase_status


@require_http_methods(["GET"])
def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok", "service": "border-surveillance-django", "storage": "local-state"})


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    operator_id = str(payload.get("operatorId") or "").strip()
    passcode = str(payload.get("passcode") or "")
    if not operator_id or not passcode:
        return _error("operatorId and passcode are required")

    repository.ensure_demo_auth_users()
    session = repository.authenticate_user(operator_id, passcode)
    if not session:
        return _error("invalid operator credentials", 401)
    token = signing.dumps(session, salt="borderlens.console.auth")
    return JsonResponse({"session": session, "token": token})


@require_http_methods(["GET"])
def bootstrap(request: HttpRequest) -> JsonResponse:
    data, firebase = _snapshot_with_firebase_alerts()
    return JsonResponse({
        "data": data,
        "meta": {"source": "django", "generatedAt": _now()},
        "blockchain": blockchain.get_status(),
        "firebase": firebase,
    })


@require_http_methods(["GET"])
def blockchain_status(request: HttpRequest) -> JsonResponse:
    return JsonResponse(blockchain.get_status())


@require_http_methods(["GET"])
def firebase_status_view(request: HttpRequest) -> JsonResponse:
    return JsonResponse(firebase_status())


@csrf_exempt
@require_http_methods(["POST"])
def inference_frame(request: HttpRequest) -> JsonResponse:
    """Run the configured local AI model on one browser-captured JPEG frame."""
    if not request.body:
        return _error("frame body is empty")
    if len(request.body) > 4 * 1024 * 1024:
        return _error("frame is larger than the 4 MB inference limit", 413)
    requested_modules = [
        value.strip()
        for value in request.GET.get("modules", "").split(",")
        if value.strip()
    ]
    try:
        return JsonResponse(detect_frame(request.body, requested_modules or None))
    except ValueError as exc:
        return _error(str(exc))
    except InferenceConfigurationError as exc:
        return _error(str(exc), 503)
    except Exception:
        return _error("AI inference failed for this frame", 503)


@csrf_exempt
@require_http_methods(["POST"])
def create_guard(request: HttpRequest) -> JsonResponse:
    session = _session_from_request(request)
    if not session or session.get("tier") != "admin":
        return _error("administrator access is required", 403)

    payload = _body(request)
    name = str(payload.get("name") or "").strip()
    rank = str(payload.get("rank") or "").strip()
    badge_id = str(payload.get("badgeId") or "").strip().upper()
    operator_id = str(payload.get("operatorId") or badge_id).strip().upper()
    passcode = str(payload.get("passcode") or "")
    if not name or not rank or not badge_id or not operator_id:
        return _error("name, rank, badgeId, and operatorId are required")
    if len(passcode) < 6:
        return _error("passcode must be at least 6 characters")
    if str(payload.get("status") or "off_duty") not in {
        "on_post",
        "patrolling",
        "break",
        "unreachable",
        "off_duty",
    }:
        return _error("status must be on_post, patrolling, break, unreachable, or off_duty")

    guard_id = str(payload.get("id") or f"G-{badge_id}").strip().upper()
    if not guard_id:
        return _error("guard id is required")
    access_tier = _access_tier_for_rank(rank)
    guard = {
        "id": guard_id,
        "name": name,
        "rank": rank,
        "badgeId": badge_id,
        "photoUrl": str(payload.get("photoUrl") or ""),
        "phone": str(payload.get("phone") or ""),
        "emergencyContact": {
            "name": str(payload.get("emergencyContactName") or ""),
            "phone": str(payload.get("emergencyContactPhone") or ""),
            "relation": str(payload.get("emergencyContactRelation") or ""),
        },
        "callSign": str(payload.get("callSign") or guard_id),
        "certifications": [
            item.strip()
            for item in str(payload.get("certifications") or "").split(",")
            if item.strip()
        ],
        "bloodGroup": str(payload.get("bloodGroup") or ""),
        "status": str(payload.get("status") or "off_duty"),
        "currentPostId": str(payload.get("postId") or "") or None,
        "currentSector": str(payload.get("sector") or "") or None,
        "shiftStart": str(payload.get("shiftStart") or ""),
        "shiftEnd": str(payload.get("shiftEnd") or ""),
        "attendanceHistory": [],
    }
    auth_user = {
        "id": operator_id,
        "operatorId": operator_id,
        "passwordHash": make_password(passcode),
        "name": name,
        "rank": rank,
        "role": "Guard access",
        "tier": access_tier,
    }
    try:
        created = repository.create_guard_with_credentials(guard, auth_user)
    except ValueError as exc:
        return _error(str(exc), 409)
    return JsonResponse({"guard": created, "accessTier": access_tier}, status=201)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def alerts(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        data, firebase = _snapshot_with_firebase_alerts()
        return JsonResponse({"alerts": data["alerts"], "firebase": firebase})
    payload = _body(request)
    alert_id = str(payload.get("id") or f"ALT-{int(datetime.now(timezone.utc).timestamp() * 1000)}")
    alert = {
        **payload,
        "id": alert_id,
        "timestamp": payload.get("timestamp") or _now(),
        "status": payload.get("status") or "open",
        "acknowledgedBy": payload.get("acknowledgedBy"),
    }
    saved = repository.upsert("alerts", alert)
    firebase = _save_alert_to_firebase(saved)
    response_status = 503 if firebase.get("alertsSynced") is False else 201
    response = {"alert": saved, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert was saved locally but could not be written to Firebase."
    return JsonResponse(response, status=response_status)


@csrf_exempt
@require_http_methods(["POST"])
def alert_action(request: HttpRequest, alert_id: str) -> JsonResponse:
    payload = _body(request)
    action = str(payload.get("action") or "").lower()
    if action not in {"acknowledge", "escalate"}:
        return _error("action must be acknowledge or escalate")
    alert = repository.get("alerts", alert_id)
    if not alert:
        _snapshot_with_firebase_alerts()
        alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    actor = str(payload.get("actorName") or repository.snapshot()["currentUser"]["name"])
    status = "acknowledged" if action == "acknowledge" else "escalated"
    updated = repository.update("alerts", alert_id, {"status": status, "acknowledgedBy": actor})
    firebase = _save_alert_to_firebase(updated or alert)
    log = _activity(
        actor_id=repository.snapshot()["currentUser"]["badgeId"],
        actor_name=actor,
        action_type=f"alert_{status}",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"{status.title()} alert {alert_id}: {alert.get('eventType', 'incident') }.",
    )
    response_status = 503 if firebase.get("alertsSynced") is False else 200
    response = {"alert": updated, "activity": log, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert status was saved locally but could not be updated in Firebase."
    return JsonResponse(response, status=response_status)


@csrf_exempt
@require_http_methods(["POST"])
def anchor_alert(request: HttpRequest, alert_id: str) -> JsonResponse:
    alert = repository.get("alerts", alert_id)
    if not alert:
        _snapshot_with_firebase_alerts()
        alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    try:
        result = blockchain.anchor(alert)
    except Exception as exc:
        return _error(str(exc), 503)
    updated = repository.update("alerts", alert_id, {
        "blockchainStatus": result["status"],
        "blockchainTxId": result["transactionHash"],
        "blockchainBlockNumber": result["blockNumber"],
        "blockchainConfirmedAt": result["confirmedAt"],
        "blockchainIncidentHash": result["incidentReferenceHash"],
        "evidenceSha256": result["evidenceSha256"],
    })
    firebase = _save_alert_to_firebase(updated or alert)
    log = _activity(
        actor_id="SYSTEM",
        actor_name="BLOCKCHAIN ANCHOR WORKER",
        action_type="blockchain_anchored",
        target_type="alert",
        target_id=alert_id,
        sector=str(alert.get("sector") or "All Sectors"),
        details=f"Evidence hash anchored in EvidenceRegistry. Transaction: {result['transactionHash']}.",
    )
    response_status = 503 if firebase.get("alertsSynced") is False else 200
    response = {"alert": updated, "blockchain": result, "activity": log, "firebase": firebase}
    if response_status == 503:
        response["error"] = "Alert was anchored locally but its Firebase record could not be updated."
    return JsonResponse(response, status=response_status)


@require_http_methods(["GET"])
def verify_alert(request: HttpRequest, alert_id: str) -> JsonResponse:
    alert = repository.get("alerts", alert_id)
    if not alert:
        return _error("alert not found", 404)
    return JsonResponse({"verification": blockchain.verify(alert)})


@csrf_exempt
@require_http_methods(["POST"])
def activity(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    entry = _activity(
        actor_id=str(payload.get("actorId") or "SYSTEM"),
        actor_name=str(payload.get("actorName") or "SYSTEM"),
        action_type=str(payload.get("actionType") or "patrol_checkin"),
        target_type=str(payload.get("targetType") or "system"),
        target_id=str(payload.get("targetId") or "SYSTEM"),
        sector=str(payload.get("sector") or "All Sectors"),
        details=str(payload.get("details") or ""),
        entry_id=payload.get("id"),
        timestamp=payload.get("timestamp"),
    )
    return JsonResponse({"activity": entry}, status=201)


@csrf_exempt
@require_http_methods(["PATCH"])
def guard_detail(request: HttpRequest, guard_id: str) -> JsonResponse:
    payload = _body(request)
    guard = repository.get("guards", guard_id)
    if not guard:
        return _error("guard not found", 404)
    allowed = {"status", "currentPostId", "currentSector", "shiftStart", "shiftEnd"}
    changes = {key: value for key, value in payload.items() if key in allowed}
    if "status" in changes and changes["status"] not in {"on_post", "patrolling", "break", "unreachable", "off_duty"}:
        return _error("unsupported guard status")
    updated = repository.update("guards", guard_id, changes)
    return JsonResponse({"guard": updated})


@csrf_exempt
@require_http_methods(["PATCH"])
def shift_detail(request: HttpRequest, shift_id: str) -> JsonResponse:
    payload = _body(request)
    shift = repository.get("shifts", shift_id)
    if not shift:
        return _error("shift not found", 404)
    changes = {
        key: value
        for key, value in payload.items()
        if key in {"guardId", "guardName", "sector", "postId", "start", "end", "day", "shiftName"}
    }
    updated = repository.update("shifts", shift_id, changes)
    return JsonResponse({"shift": updated})


@csrf_exempt
@require_http_methods(["POST"])
def handover(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    outgoing_id = str(payload.get("outgoingGuardId") or "")
    incoming_id = str(payload.get("incomingGuardId") or "")
    outgoing = repository.get("guards", outgoing_id)
    incoming = repository.get("guards", incoming_id)
    if not outgoing or not incoming:
        return _error("outgoingGuardId and incomingGuardId must reference guards")
    post_id = outgoing.get("currentPostId") or "POST-A1-MAIN"
    sector = outgoing.get("currentSector") or "All Sectors"
    now = _now()
    repository.update("guards", outgoing_id, {"status": "off_duty", "currentPostId": None, "currentSector": None})
    repository.update("guards", incoming_id, {"status": "on_post", "currentPostId": post_id, "currentSector": sector, "shiftStart": now})
    log = _activity(
        actor_id=incoming_id,
        actor_name=str(incoming["name"]),
        action_type="handover_completed",
        target_type="post",
        target_id=str(post_id),
        sector=str(sector),
        details=f"Shift turnover: {outgoing['name']} handed over to {incoming['name']}. {payload.get('notes') or 'Turnover complete.'}",
    )
    return JsonResponse({"guards": repository.snapshot()["guards"], "activity": log})


@csrf_exempt
@require_http_methods(["PATCH"])
def camera_detail(request: HttpRequest, camera_id: str) -> JsonResponse:
    payload = _body(request)
    camera = repository.get("cameras", camera_id)
    if not camera:
        return _error("camera not found", 404)
    allowed = {"aiActive", "personDetection", "vehicleDetection", "weaponDetection", "confidenceThreshold", "minObjectSizePx", "zonePolygon", "triggerAction", "dwellTimeSeconds", "status", "pan", "tilt", "zoom"}
    changes = {key: value for key, value in payload.items() if key in allowed}
    updated = repository.update("cameras", camera_id, changes)
    return JsonResponse({"camera": updated})


@csrf_exempt
@require_http_methods(["POST"])
def system_action(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    action = str(payload.get("action") or "")
    current = repository.snapshot()
    if action == "lockdown":
        changes = {"lockdownActive": True, "defconLevel": 1}
    elif action == "abort_lockdown":
        changes = {"lockdownActive": False, "defconLevel": 2}
    elif action == "defcon":
        try:
            level = int(payload.get("level"))
        except (TypeError, ValueError):
            return _error("level must be an integer from 1 to 5")
        if level not in {1, 2, 3, 4, 5}:
            return _error("level must be an integer from 1 to 5")
        changes = {"defconLevel": level, "lockdownActive": level == 1}
    else:
        return _error("unsupported system action")
    system = repository.system_update(changes)
    log = _activity(
        actor_id=str(current["currentUser"]["badgeId"]),
        actor_name=str(payload.get("actorName") or current["currentUser"]["name"]),
        action_type="lockdown_initiated",
        target_type="system",
        target_id=action.upper(),
        sector="All Sectors",
        details=f"System action {action} applied. DEFCON {system['defconLevel']}.",
    )
    return JsonResponse({"system": system, "activity": log})


@csrf_exempt
@require_http_methods(["POST"])
def sync(request: HttpRequest) -> JsonResponse:
    payload = _body(request)
    result = repository.merge_sync(payload.get("alerts") or [], payload.get("activityLog") or [])
    data, firebase = _snapshot_with_firebase_alerts()
    return JsonResponse({
        "accepted": result,
        "data": data,
        "blockchain": blockchain.get_status(),
        "firebase": firebase,
    })


@csrf_exempt
@require_http_methods(["POST"])
def reset(request: HttpRequest) -> JsonResponse:
    return JsonResponse({
        "data": repository.reset(),
        "blockchain": blockchain.get_status(),
        "firebase": firebase_status(),
    })


def _body(request: HttpRequest) -> dict[str, Any]:
    try:
        value = json.loads(request.body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("request body must be a JSON object")
    return value


def _activity(*, actor_id: str, actor_name: str, action_type: str, target_type: str, target_id: str, sector: str, details: str, entry_id: str | None = None, timestamp: str | None = None) -> dict[str, Any]:
    return repository.add_activity({
        "id": entry_id,
        "timestamp": timestamp or _now(),
        "actorId": actor_id,
        "actorName": actor_name,
        "actionType": action_type,
        "targetType": target_type,
        "targetId": target_id,
        "sector": sector,
        "details": details,
    })


def _snapshot_with_firebase_alerts() -> tuple[dict[str, Any], dict[str, Any]]:
    """Merge Firestore history into the local cache before returning API data."""
    data = repository.snapshot()
    firebase = firebase_status()
    if not firebase.get("initialized"):
        return data, firebase

    try:
        store = get_alert_store()
        remote_alerts = store.list_alerts()
        remote_ids = {str(alert.get("id")) for alert in remote_alerts}
        local_alerts = data.get("alerts", [])
        missing_remote = [alert for alert in local_alerts if str(alert.get("id")) not in remote_ids]
        if missing_remote:
            store.upsert_alerts(missing_remote)
            remote_alerts.extend(missing_remote)
        for alert in remote_alerts:
            repository.upsert("alerts", alert)
        data["alerts"] = sorted(remote_alerts, key=lambda alert: _alert_sort_key(alert.get("timestamp")), reverse=True)
        return data, {
            **firebase,
            "alertsSynced": True,
            "alertsCount": len(data["alerts"]),
        }
    except Exception as exc:
        return data, {
            **firebase,
            "alertsSynced": False,
            "alertsCount": len(data.get("alerts", [])),
            "message": f"Firebase alert sync failed: {exc}",
        }


def _save_alert_to_firebase(alert: dict[str, Any]) -> dict[str, Any]:
    firebase = firebase_status()
    if not firebase.get("initialized"):
        return {
            **firebase,
            # Firebase remains optional for local-only installations. A
            # configured-but-unavailable Firebase instance is handled as a
            # failed write below by returning alertsSynced=False.
            "alertsSynced": False if firebase.get("configured") else None,
            "alertsCount": None,
        }
    try:
        get_alert_store().upsert_alert(alert)
        return {**firebase, "alertsSynced": True}
    except Exception as exc:
        return {
            **firebase,
            "alertsSynced": False,
            "message": f"Firebase alert write failed: {exc}",
        }


def _alert_sort_key(value: Any) -> datetime:
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=timezone.utc)
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _session_from_request(request: HttpRequest) -> dict[str, Any] | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        value = signing.loads(header[7:], salt="borderlens.console.auth", max_age=60 * 60 * 12)
    except signing.BadSignature:
        return None
    return value if isinstance(value, dict) else None


def _access_tier_for_rank(rank: str) -> str:
    normalized = rank.strip().casefold()
    if normalized in {"administrator", "admin", "system administrator"}:
        return "admin"
    if normalized in {"inspector", "sub-inspector", "assistant commandant", "commandant"}:
        return "command"
    return "field"
