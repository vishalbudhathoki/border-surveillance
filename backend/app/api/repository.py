"""Thread-safe local API state used for the hackathon deployment."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Iterable, Optional



STATE_SCHEMA_VERSION = 2


def empty_state() -> dict[str, Any]:
    """Return a clean outpost state with no fabricated operational records."""
    return {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "currentUser": {
            "name": "Local operator",
            "rank": "Operator",
            "badgeId": "LOCAL-OPERATOR",
            "role": "Local command console",
        },
        "guards": [],
        "shifts": [],
        "activityLog": [],
        "alerts": [],
        "cameras": [],
        "sectors": [],
        "pois": [],
        "anprRecords": [],
        "authUsers": [],
        "system": {"lockdownActive": False, "defconLevel": 2},
    }


class ApiRepository:
    def __init__(self, state_path: Optional[str] = None) -> None:
        configured_path = state_path or os.getenv("API_STATE_PATH")
        self.path = Path(configured_path) if configured_path else Path(__file__).resolve().parents[2] / ".localdata" / "api_state.json"
        self._lock = RLock()
        self._state = self._load()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            state = deepcopy(self._state)
            # Password hashes are backend-only and must never be sent to the UI.
            state.pop("authUsers", None)
            return state

    def reset(self) -> dict[str, Any]:
        with self._lock:
            auth_users = deepcopy(self._state.get("authUsers", []))
            self._state = empty_state()
            # Reset operational telemetry without deleting provisioned guard
            # credentials. Administrators should not lose accounts by using
            # the UI's cache reset action.
            self._state["authUsers"] = auth_users
            self._persist()
            return deepcopy(self._state)

    def get(self, collection: str, item_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            for item in self._state.get(collection, []):
                if item.get("id") == item_id:
                    return deepcopy(item)
        return None

    def upsert(self, collection: str, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            items = self._state.setdefault(collection, [])
            for index, existing in enumerate(items):
                if existing.get("id") == item.get("id"):
                    items[index] = deepcopy(item)
                    self._persist()
                    return deepcopy(item)
            items.insert(0, deepcopy(item))
            self._persist()
            return deepcopy(item)

    def update(self, collection: str, item_id: str, changes: dict[str, Any]) -> Optional[dict[str, Any]]:
        with self._lock:
            for index, item in enumerate(self._state.get(collection, [])):
                if item.get("id") == item_id:
                    updated = {**item, **deepcopy(changes), "id": item_id}
                    self._state[collection][index] = updated
                    self._persist()
                    return deepcopy(updated)
        return None

    def add_activity(self, entry: dict[str, Any]) -> dict[str, Any]:
        activity = {
            **entry,
            "id": entry.get("id") or _new_id("LOG"),
            "timestamp": entry.get("timestamp") or _now(),
        }
        return self.upsert("activityLog", activity)

    def merge_sync(self, alerts: Iterable[dict[str, Any]], activities: Iterable[dict[str, Any]]) -> dict[str, int]:
        accepted_alerts = 0
        accepted_activities = 0
        with self._lock:
            for alert in alerts:
                if alert.get("id"):
                    self._upsert_locked("alerts", alert)
                    accepted_alerts += 1
            for activity in activities:
                if activity.get("id"):
                    self._upsert_locked("activityLog", activity)
                    accepted_activities += 1
            self._persist()
        return {"alerts": accepted_alerts, "activityLog": accepted_activities}

    def system_update(self, changes: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._state.setdefault("system", {}).update(deepcopy(changes))
            self._persist()
            return deepcopy(self._state["system"])

    def update_current_user(self, user: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._state["currentUser"] = deepcopy(user)
            self._persist()
            return deepcopy(self._state["currentUser"])

    def create_guard_with_credentials(
        self, guard: dict[str, Any], auth_user: dict[str, Any]
    ) -> dict[str, Any]:
        with self._lock:
            if any(item.get("id") == guard.get("id") for item in self._state.get("guards", [])):
                raise ValueError("guard id already exists")
            if any(
                str(item.get("operatorId", "")).casefold()
                == str(auth_user.get("operatorId", "")).casefold()
                for item in self._state.get("authUsers", [])
            ):
                raise ValueError("operator id already exists")
            self._upsert_locked("guards", guard)
            self._upsert_locked("authUsers", auth_user)
            self._persist()
            return deepcopy(guard)

    def ensure_demo_auth_users(self) -> None:
        """Create local demo credentials when an older state has no auth users."""
        from django.contrib.auth.hashers import make_password

        defaults = [
            {
                "id": "ADMIN-001",
                "operatorId": "ADMIN-001",
                "passwordHash": make_password("BL-ADMIN-2026"),
                "name": "BorderLens System Administrator",
                "rank": "Administrator",
                "role": "Full system access",
                "tier": "admin",
            },
            {
                "id": "SSB-2041",
                "operatorId": "SSB-2041",
                "passwordHash": make_password("BL-COMMAND-2041"),
                "name": "Inspector Arjun Mehta",
                "rank": "Inspector",
                "role": "Border Operations Lead",
                "tier": "command",
            },
            {
                "id": "SSB-2098",
                "operatorId": "SSB-2098",
                "passwordHash": make_password("BL-FIELD-2098"),
                "name": "Rifleman Neha Rawat",
                "rank": "Rifleman",
                "role": "Field Sentry",
                "tier": "field",
            },
        ]
        with self._lock:
            users = self._state.setdefault("authUsers", [])
            existing_ids = {str(item.get("operatorId", "")).casefold() for item in users}
            changed = False
            for user in defaults:
                if user["operatorId"].casefold() not in existing_ids:
                    users.append(user)
                    changed = True
            if changed:
                self._persist()

    def authenticate_user(self, operator_id: str, passcode: str) -> Optional[dict[str, Any]]:
        from django.contrib.auth.hashers import check_password

        normalized_id = operator_id.strip().casefold()
        with self._lock:
            users = deepcopy(self._state.get("authUsers", []))
        for user in users:
            if str(user.get("operatorId", "")).casefold() != normalized_id:
                continue
            if check_password(passcode, str(user.get("passwordHash", ""))):
                return {
                    key: value
                    for key, value in user.items()
                    if key not in {"id", "passwordHash"}
                }
        return None

    def _upsert_locked(self, collection: str, item: dict[str, Any]) -> None:
        items = self._state.setdefault(collection, [])
        for index, existing in enumerate(items):
            if existing.get("id") == item.get("id"):
                items[index] = {**existing, **deepcopy(item)}
                return
        items.insert(0, deepcopy(item))

    def _load(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and payload.get("schemaVersion") == STATE_SCHEMA_VERSION:
                payload.setdefault("authUsers", [])
                return payload
        except (OSError, ValueError, TypeError):
            pass
        return empty_state()

    def _persist(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(self._state, indent=2), encoding="utf-8")
            temporary.replace(self.path)
        except OSError:
            # The in-memory state still serves the request if storage is
            # read-only or ephemeral.
            return


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"


repository = ApiRepository()
