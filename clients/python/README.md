# Fieldbook Python client

A single file (`fieldbook_client.py`) that only needs `requests`. It runs on Python 3.8+.

```bash
pip install -r requirements.txt
export FIELDBOOK_URL=https://your-app.example.com
export FIELDBOOK_API_KEY=rig_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

python fieldbook_client.py health          # check the key
python fieldbook_client.py tasks [venue]   # list recordable tasks
python fieldbook_client.py flush           # retry queued episodes
```

## Use from a recording script

```python
import os
from fieldbook_client import FieldbookClient

fb = FieldbookClient(os.environ["FIELDBOOK_URL"], os.environ["FIELDBOOK_API_KEY"])

venue_id = "..."                                  # from the app (Venues page) or list_tasks()
tasks = fb.list_tasks(venue_id=venue_id)          # ready + collecting, filtered to this rig's arms
session = fb.start_session("operator@example.com", venue_id)

task = tasks[0]
print(task["code"], task["instruction"], task["remaining_episodes"], "left")

# ... record ...
fb.log_episode(session, task["code"], "success", duration_s=41.2, data_uri="s3://bucket/ep-0001.mcap")
fb.log_episode(session, task["code"], "failure", failure_reason="Grasp slip")

fb.end_session(session, notes="all good")         # flushes the offline queue first
```

## Offline queue

When the network is down, the server returns 5xx, or the client is rate limited, `log_episode()` returns `None` and writes the episode to `.fieldbook-queue.jsonl` (the path is configurable with `queue_path=`). Each line is written with `fsync`, so a crash doesn't lose it.

- `fb.queued()`: how many episodes are waiting.
- `fb.flush_queue()`: retries them in order and returns `{"sent", "rejected", "remaining"}`. It stops at the first network failure, so order is preserved.
- `fb.flush_forever(interval_s=15)`: blocks until the queue is empty.

Every episode has a client-generated `external_id`, so replaying the queue never creates duplicates: the server returns the episode it already has. Permanently rejected entries (for example an unknown task code) go to `.fieldbook-queue.rejected.jsonl` for inspection, so they don't block the rest of the queue.

## Tests

```bash
python -m unittest test_fieldbook_client   # offline-queue behaviour, no server needed
```
