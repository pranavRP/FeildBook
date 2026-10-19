# Episode API (v1)

Your operator tool uses this API to fetch the tasks you've marked **Ready** here, and optionally to report sessions and episodes back so progress shows on the dashboard. Base path: `/api/v1`.

**Typical integration:** poll `GET /tasks` every minute or so (or when the operator opens the task picker). Tasks appear as soon as they're marked Ready, and disappear when moved back to Proposed or when they reach their target (Done).

## Authentication

Every request needs one rig API key:

```
Authorization: Bearer rig_<8-char prefix>_<32-char secret>
```

- An admin creates keys under **Admin → Rigs & API keys**. A key is shown **once**; only its SHA-256 hash is stored.
- Keys are per rig and can be revoked at any time. A revoked key, or any key on an inactive rig, gets `401`.
- Each key is rate limited to **60 requests/minute** (`API_RATE_LIMIT_PER_MINUTE`). Over the limit you get `429` with `Retry-After: 60`.

## Errors

Errors are JSON with a stable `code`:

```json
{ "error": { "code": "validation_failed", "message": "Request body is invalid.",
             "details": [{ "path": "external_id", "message": "Invalid UUID" }] } }
```

| Status | Codes |
|---|---|
| 400 | `bad_json` |
| 401 | `unauthorized` |
| 403 | `venue_not_assigned` |
| 404 | `session_not_found`, `task_not_found`, `venue_not_found` |
| 409 | `session_ended`, `task_not_ready` |
| 422 | `validation_failed`, `unknown_operator`, `task_not_in_venue` |
| 429 | `rate_limited` (safe to retry) |
| 5xx | `internal`, `unavailable` (safe to retry) |

The examples below assume:

```bash
export FB=http://localhost:3000/api/v1
export KEY=rig_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## `GET /health`

Checks the key.

```bash
curl -s $FB/health -H "Authorization: Bearer $KEY"
```
```json
{ "ok": true, "rig": { "id": "…", "name": "Rig A", "arms": 1 }, "key_prefix": "qn6gyxeb", "time": "…" }
```

## `GET /tasks?venue_id=&status=`

Lists tasks you can record now. `status` is a comma-separated list (default `ready,collecting`). The list only includes tasks whose `arms_required` is at most the rig's arm count.

```bash
curl -s "$FB/tasks?venue_id=$VENUE&status=ready" -H "Authorization: Bearer $KEY"
```
```json
{ "tasks": [{
  "code": "T-0012", "instruction": "Put the loose stirrers back into the red cup, all upright",
  "version": 1, "status": "ready", "arms_required": 1,
  "venue": { "id": "…", "name": "Office Site A" },
  "scene": { "id": "…", "name": "Coffee counter", "reset_instructions": null },
  "photo_url": "https://…signed…", "photo_url_expires_in": 300,
  "success_count": 0, "target_episodes": 50, "remaining_episodes": 50
}]}
```

`photo_url` is a signed URL that expires after 5 minutes. Fetch the task list again to get a fresh one.

## `POST /sessions`

Starts a session on this rig. An operator must be active and assigned to the venue. Admins and designers can record anywhere.

```bash
curl -s -X POST $FB/sessions -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"operator_email":"operator@example.com","venue_id":"'$VENUE'"}'
```
```json
{ "session_id": "161d99fe-…", "started_at": "2026-10-17T20:16:39Z" }
```

## `POST /episodes`

Logs one episode. This call is **idempotent on `external_id`**: generate a UUID on the client and resend the same one when retrying. A repeat returns the original episode with `200` and `"created": false`. A new episode returns `201`.

| Field | Type | |
|---|---|---|
| `external_id` | uuid | required, client-generated |
| `session_id` | uuid | required; must be an open session on this rig |
| `task_code` | string | required, e.g. `T-0012`; the task must be in the session's venue and be ready, collecting or done |
| `outcome` | `success` \| `failure` \| `aborted` | required |
| `failure_reason` | string | required when `outcome` is `failure` |
| `duration_s` | number | optional |
| `data_uri` | string | optional; where the recording lives (files are not uploaded here) |
| `metadata` | object | optional; free-form JSON |

```bash
curl -s -X POST $FB/episodes -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "external_id": "8ba75541-cf13-4835-a593-6cfda1e2ca74",
  "session_id": "161d99fe-0c5b-4d96-935a-2d8136568cc5",
  "task_code": "T-0012", "outcome": "failure", "failure_reason": "Grasp slip",
  "duration_s": 41.5, "data_uri": "s3://bucket/2026-10-17/ep-0001.mcap"
}'
```
```json
{ "created": true, "episode": {
  "id": "…", "external_id": "8ba75541-…", "task_code": "T-0012", "task_version": 1,
  "outcome": "failure", "failure_reason": "Grasp slip", "duration_s": 41.5, "created_at": "…",
  "task": { "status": "collecting", "success_count": 0, "target_episodes": 50, "remaining_episodes": 50 }
}}
```

The episode is stamped with the task's current instruction version (`task_version`). On the first episode, the task moves from `ready` to `collecting`. It becomes `done` automatically once `success_count` reaches `target_episodes`.

Suggested failure reasons: Grasp slip, Collision, Reach limit, Timeout, Operator error, Other.

## `PATCH /sessions/{id}`

Ends a session (`ended_at` defaults to now) and optionally sets notes. Episodes sent after the end return `409 session_ended`.

```bash
curl -s -X PATCH $FB/sessions/$SESSION -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"notes":"Wi-Fi dropped twice"}'
```
```json
{ "session": { "id": "…", "started_at": "…", "ended_at": "…", "notes": "Wi-Fi dropped twice", "episode_count": 37 } }
```

## Python client

See [`clients/python`](../clients/python/README.md). It covers every endpoint and adds an offline queue, so episodes aren't lost when venue Wi-Fi drops.
