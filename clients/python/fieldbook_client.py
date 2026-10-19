"""
Minimal client for the Fieldbook episode API (v1).

Only depends on `requests`. Episodes that can't be delivered (network down,
server error, rate limit) are appended to an on-disk JSONL queue and retried
with `flush_queue()`. Every episode carries a client-generated `external_id`,
so retries are idempotent: the server returns the original episode instead of
creating a duplicate.

    from fieldbook_client import FieldbookClient
    fb = FieldbookClient("https://app.example.com", "rig_xxxxxxxx_...")
    task = fb.list_tasks(venue_id=VENUE)[0]
    session = fb.start_session("operator@example.com", VENUE)
    fb.log_episode(session, task["code"], "success", duration_s=42.0)
    fb.end_session(session)
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

__all__ = ["FieldbookClient", "FieldbookError"]

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


class FieldbookError(Exception):
    """A non-retryable API error (bad key, validation failure, unknown task, ...)."""

    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class FieldbookClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        queue_path: str = ".fieldbook-queue.jsonl",
        timeout: float = 10.0,
    ):
        if not api_key.startswith("rig_"):
            raise ValueError("api_key should look like rig_<prefix>_<secret>")
        self.base_url = base_url.rstrip("/") + "/api/v1"
        self.queue_path = Path(queue_path)
        self.timeout = timeout
        self._lock = threading.Lock()
        self._http = requests.Session()
        self._http.headers.update({"Authorization": f"Bearer {api_key}", "User-Agent": "fieldbook-python/1.0"})

    # ------------------------------------------------------------------ HTTP
    def _request(self, method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
        resp = self._http.request(method, self.base_url + path, timeout=self.timeout, **kwargs)
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if resp.status_code >= 400:
            err = body.get("error", {}) if isinstance(body, dict) else {}
            exc = FieldbookError(resp.status_code, err.get("code", "http_error"), err.get("message", resp.text[:200]), err.get("details"))
            if resp.status_code in RETRYABLE_STATUS:
                raise _Retryable(exc)
            raise exc
        return body

    # ------------------------------------------------------------- endpoints
    def health(self) -> Dict[str, Any]:
        """Checks the key. Returns {"ok": True, "rig": {...}, ...}."""
        return self._request("GET", "/health")

    def list_tasks(self, venue_id: Optional[str] = None, status: str = "ready,collecting") -> List[Dict[str, Any]]:
        """Tasks this rig can record. Photo URLs are signed and expire after 5 minutes."""
        params = {"status": status}
        if venue_id:
            params["venue_id"] = venue_id
        return self._request("GET", "/tasks", params=params)["tasks"]

    def start_session(self, operator_email: str, venue_id: str, notes: Optional[str] = None) -> str:
        """Starts a session and returns its id."""
        payload = {"operator_email": operator_email, "venue_id": venue_id}
        if notes:
            payload["notes"] = notes
        return self._request("POST", "/sessions", json=payload)["session_id"]

    def end_session(self, session_id: str, notes: Optional[str] = None, ended_at: Optional[str] = None) -> Dict[str, Any]:
        """Ends a session. Flushes queued episodes first so none arrive after the end."""
        self.flush_queue()
        payload: Dict[str, Any] = {}
        if notes is not None:
            payload["notes"] = notes
        if ended_at is not None:
            payload["ended_at"] = ended_at
        return self._request("PATCH", f"/sessions/{session_id}", json=payload)["session"]

    def log_episode(
        self,
        session_id: str,
        task_code: str,
        outcome: str,
        failure_reason: Optional[str] = None,
        duration_s: Optional[float] = None,
        data_uri: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        external_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Logs an episode. Returns the server's episode dict, or None if it was
        queued for later delivery because the network/server was unavailable.
        """
        payload: Dict[str, Any] = {
            "external_id": external_id or str(uuid.uuid4()),
            "session_id": session_id,
            "task_code": task_code,
            "outcome": outcome,
        }
        for key, value in (
            ("failure_reason", failure_reason),
            ("duration_s", duration_s),
            ("data_uri", data_uri),
            ("metadata", metadata),
        ):
            if value is not None:
                payload[key] = value
        try:
            return self._request("POST", "/episodes", json=payload)["episode"]
        except (_Retryable, requests.ConnectionError, requests.Timeout):
            self._enqueue(payload)
            return None

    # ----------------------------------------------------------------- queue
    def _enqueue(self, payload: Dict[str, Any]) -> None:
        with self._lock, self.queue_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def queued(self) -> int:
        """Number of episodes waiting in the offline queue."""
        if not self.queue_path.exists():
            return 0
        with self.queue_path.open(encoding="utf-8") as f:
            return sum(1 for line in f if line.strip())

    def flush_queue(self) -> Dict[str, int]:
        """
        Retries queued episodes in order. Delivered (or permanently rejected)
        entries are removed; the rest stay for the next flush.
        Returns {"sent": n, "rejected": n, "remaining": n}.
        """
        with self._lock:
            if not self.queue_path.exists():
                return {"sent": 0, "rejected": 0, "remaining": 0}
            lines = [l for l in self.queue_path.read_text(encoding="utf-8").splitlines() if l.strip()]
            sent = rejected = 0
            remaining: List[str] = []
            for i, line in enumerate(lines):
                try:
                    self._request("POST", "/episodes", json=json.loads(line))
                    sent += 1
                except FieldbookError as exc:
                    # Permanent rejection: keep a record next to the queue and move on.
                    rejected += 1
                    with self.queue_path.with_suffix(".rejected.jsonl").open("a", encoding="utf-8") as f:
                        f.write(json.dumps({"payload": json.loads(line), "error": str(exc)}) + "\n")
                except (_Retryable, requests.ConnectionError, requests.Timeout):
                    remaining = lines[i:]  # still offline: keep this and everything after it
                    break
            tmp = self.queue_path.with_suffix(".tmp")
            tmp.write_text("".join(l + "\n" for l in remaining), encoding="utf-8")
            tmp.replace(self.queue_path)
            return {"sent": sent, "rejected": rejected, "remaining": len(remaining)}

    def flush_forever(self, interval_s: float = 15.0) -> None:
        """Blocking helper: keep retrying the queue until it is empty."""
        while self.queued():
            if self.flush_queue()["remaining"]:
                time.sleep(interval_s)


class _Retryable(Exception):
    def __init__(self, inner: FieldbookError):
        super().__init__(str(inner))
        self.inner = inner


def _main(argv: List[str]) -> int:
    """Tiny CLI: python fieldbook_client.py health|tasks [venue_id]|flush"""
    url = os.environ.get("FIELDBOOK_URL", "http://localhost:3000")
    key = os.environ.get("FIELDBOOK_API_KEY")
    if not key:
        print("Set FIELDBOOK_API_KEY (and FIELDBOOK_URL).", file=sys.stderr)
        return 2
    fb = FieldbookClient(url, key)
    cmd = argv[1] if len(argv) > 1 else "health"
    if cmd == "health":
        print(json.dumps(fb.health(), indent=2))
    elif cmd == "tasks":
        for t in fb.list_tasks(venue_id=argv[2] if len(argv) > 2 else None):
            print(f'{t["code"]}  {t["remaining_episodes"]:>3} left  {t["instruction"]}')
    elif cmd == "flush":
        print(fb.flush_queue())
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
