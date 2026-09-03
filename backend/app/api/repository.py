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
            return deepcopy(self._state)

    def reset(self) -> dict[str, Any]:
        with self._lock:
            self._state = empty_state()
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
