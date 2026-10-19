# 5-minute demo script

**Story:** our task list lived in a messy spreadsheet. Now it's a secure system of record that operators use at the rig, and it shows collection progress live.

## Before the meeting (10 min)

```bash
pnpm db:start
pnpm db:reset && pnpm demo:setup     # fresh data: ~40 real tasks, photos, 14 days of history
pnpm build && pnpm start             # production build (faster than dev); or `pnpm dev`
```

- `DEMO_ANONYMIZE=true` in `.env.local` keeps venue names neutral ("Office Site A", "Showroom B").
- **Laptop / projector (1440px):** sign in as `designer@example.com` with the password `Fieldbook2026`.
- Open a terminal in the repo, ready for `pnpm simulate`.

## Click path

| Time | Screen | Say / do |
|---|---|---|
| 0:00 | *(talk)* | "We collect robot-teleoperation data across offices and showrooms. Until last week every task lived in one Google Sheet: scenes inherited by row position, edits overwrote history, 'Done' was a checkbox, and 55 photos were pasted in but tied to nothing." |
| 0:30 | **Tasks** | "We imported that sheet: deduped, scenes inferred, props split into *at the scene* and *to buy*." Press **/**, type `stirrers`, and open it. Back on the list, filter **Status → Collecting**. Point at the progress bars: "Every task has an episode target, and counts come from real episodes." |
| 1:15 | **Venues & Scenes → Coffee counter** | Photo gallery and lightbox. "Each scene is a record: reference photos, clearance notes, reset steps, and its tasks." Mention "Unsorted": images the importer couldn't place wait in an inbox. |
| 1:45 | **Task T-0033** | **Version history** shows *Put lid on Dutch oven* → *Take off lid from pot (light lid)* as a word diff, with the reason. "Edits never overwrite. Every episode records which version it was recorded against, so the training data stays honest." Show the workflow button (**Move to Feasibility test**). |
| 2:30 | **Tasks → New task** | Create a task in Coffee counter, switch on **Ready for operators**, and save. "That's it: it's now in the feed our operator tool reads." Optional: show `curl $FB/tasks` returning it (see docs/API.md). |
| 3:15 | **Laptop: Dashboard** + terminal | Run `pnpm simulate`. "This is a simulated recording PC posting through the real API with a revocable rig key." Watch **Episodes today** tick up, the activity feed fill in, and **Closest to target** move. If a task reaches its target, it flips to **Done** on its own. |
| 4:00 | **Security** *(talk, optionally show Admin)* | Anyone can sign up, but a new account sees nothing until an admin grants a role and venues; roles can't be self-assigned. Row-level security in Postgres, so a contractor *cannot* query another venue's tasks or photos, even with direct API access (35 automated tests). Photos are private and served through 5-minute links; GPS/EXIF is stripped on upload. API keys are per rig, hashed and revocable. Every change is in the audit log. Show **Admin → Audit log** if signed in as admin. |
| 4:40 | *(close)* | "Next: hook the Python client into the real recording stack, and export task-version-to-episode mappings for the training pipeline." Press Ctrl+C in the terminal; the simulator ends its session cleanly. |

## If something goes wrong

- **Dashboard isn't moving:** check that the badge says **Live**. If it says Connecting, reload the page. The simulator prints each episode; if it errors, run `pnpm seed`, which re-registers the key in `.env.local`.
- **Can't sign in:** demo accounts use `Fieldbook2026`. To promote your own sign-up, run `pnpm make-admin you@gmail.com`.
- **Want a clean slate:** `pnpm db:reset && pnpm demo:setup` (about 1 minute).
