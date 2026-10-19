"""Offline-queue tests (no server needed): python -m unittest test_fieldbook_client"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import requests

from fieldbook_client import FieldbookClient


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = json.dumps(body)

    def json(self):
        return self._body


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.queue = Path(self.dir.name) / "q.jsonl"
        self.fb = FieldbookClient("http://x", "rig_abcdefgh_" + "a" * 32, queue_path=str(self.queue))

    def tearDown(self):
        self.dir.cleanup()

    def test_network_error_queues_episode(self):
        with mock.patch.object(self.fb._http, "request", side_effect=requests.ConnectionError()):
            self.assertIsNone(self.fb.log_episode("s1", "T-0001", "success"))
        self.assertEqual(self.fb.queued(), 1)
        self.assertIn("external_id", json.loads(self.queue.read_text().splitlines()[0]))

    def test_flush_sends_and_keeps_order_when_offline_again(self):
        with mock.patch.object(self.fb._http, "request", side_effect=requests.ConnectionError()):
            for _ in range(3):
                self.fb.log_episode("s1", "T-0001", "success")
        responses = [FakeResponse(201, {"episode": {}}), requests.ConnectionError()]
        with mock.patch.object(self.fb._http, "request", side_effect=responses):
            result = self.fb.flush_queue()
        self.assertEqual(result, {"sent": 1, "rejected": 0, "remaining": 2})
        self.assertEqual(self.fb.queued(), 2)

    def test_permanent_errors_are_set_aside(self):
        with mock.patch.object(self.fb._http, "request", side_effect=requests.ConnectionError()):
            self.fb.log_episode("s1", "T-9999", "success")
        bad = FakeResponse(404, {"error": {"code": "task_not_found", "message": "Task not found."}})
        with mock.patch.object(self.fb._http, "request", return_value=bad):
            self.assertEqual(self.fb.flush_queue(), {"sent": 0, "rejected": 1, "remaining": 0})
        self.assertTrue(self.queue.with_suffix(".rejected.jsonl").exists())

    def test_rate_limit_is_retryable(self):
        limited = FakeResponse(429, {"error": {"code": "rate_limited", "message": "slow"}})
        with mock.patch.object(self.fb._http, "request", return_value=limited):
            self.assertIsNone(self.fb.log_episode("s1", "T-0001", "failure", failure_reason="Collision"))
        self.assertEqual(self.fb.queued(), 1)


if __name__ == "__main__":
    unittest.main()
