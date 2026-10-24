# Acceptance checklist (spec section 11)

Status key:

- **verified** — exercised here, with the test or command that proves it
- **built, unverified** — the code path exists and typechecks/builds, but
  proving it needs a live Supabase project, an Anthropic key, Google
  credentials, a real device, or elapsed time. These are Ayush's to check
  after `SETUP.md`.
- **failing** — known not to work

Nothing in this repo has been run against a real Supabase project, the
Anthropic API, Google or a push service: no accounts were created and no
credentials were handled. Everything below marked "built, unverified" is
therefore honest about that limit.

## Part 1: Core

| # | Criterion | Status | Evidence / how to check |
| --- | --- | --- | --- |
| 1 | A Google account other than the owner's is rejected | built, unverified | `lib/auth.ts` `currentUser()` signs out any email ≠ `OWNER_EMAIL` and refuses a uid ≠ `app_config.owner_user_id`; `/auth/callback` redirects to `/login?error=not_allowed`. Needs a real second Google account to prove. |
| 2 | "Create a task … under project Website" inherits the project's goal and Area; a wrong `goal_id` is corrected or rejected | **verified** (database half) | `tests/sql/schema.test.ts`: a task inserted with only `project_id` gets the project's `goal_id`/`area_id`; inserting with a *wrong* `goal_id` is **corrected** by the `tasks_inherit_bi` trigger before the composite FK is checked. The chat half needs an API key. |
| 3 | Moving a project to another goal moves its tasks' `goal_id` | **verified** | `tests/sql/schema.test.ts` — the composite FK's `ON UPDATE CASCADE`. |
| 4 | On a Project page "add a task …" attaches to the project; on a Task page it becomes a subtask | built, unverified | `pageDefaultLinkage()` in `lib/agent/tools/entities.ts` branches on `ctx.page.entity_type`; every entity page registers `<SetPageContext>`. Needs an API key to run end to end. |
| 5 | Two "login" tasks → the agent asks; replying "2" completes the second | built, unverified (thresholds verified) | Thresholds are **verified** in `tests/unit/resolver.test.ts` (auto-pick only at ≥ 0.6 with a ≥ 0.15 margin; two near-identical "login" candidates return `ask`). The "2" path is implemented in `app/api/chat/route.ts` without consulting the model. |
| 6 | "Add this command to the login task: npm test -- login" appends a code block to the notes, editable and not lost | built, unverified | `notes_append` → `lib/domain/notes.ts` `appendNotes`, which only ever appends; the Task page's `NotesEditor` autosaves the same `notes_md`. |
| 7 | Board and List with all filters; filters survive a reload; dragging to Done sets `completed_at` | partly verified | Filter URL round-trip is **verified** in `tests/unit/filters.test.ts`; `completed_at` on status → done is **verified** in `tests/sql/schema.test.ts`. The drag interaction itself is built (`@dnd-kit` in `components/tasks/Board.tsx`, drop into Done calls `completeTaskAction`) but not browser-tested. |
| 8 | Goal page groups projects with tasks; Project page groups by status; Area pages show only that Area | built, unverified | `app/(app)/goals/[id]`, `projects/[id]`, `area/[slug]`. Rendering needs data. |
| 9 | "Undo" reverts the last agent action | built, unverified | `lib/agent/tools/undo.ts` reverses from the stored `before` in `agent_actions`; covers goals, projects, tasks, notes, habits, journal, reminders and transactions. |
| 10 | Installs as a PWA on Android and loads the dashboard in under 3s | built, unverified | `app/manifest.ts`, Serwist service worker at `/sw.js` (confirmed served by a local production run), icons present. Install and timing are Ayush's to check. |

## Part 2: Daily life

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Morning plan arrives at the configured time as a push and in the chat, with three must-do tasks; the nightly reply is saved as the journal entry with a mood | built, unverified | `lib/jobs/morning.ts` picks the three deterministically and only the prose comes from the cheap model (with a deterministic fallback); `lib/jobs/nightly.ts` + `lib/jobs/pending-reply.ts` + the hook in `app/api/chat/route.ts` save the reply and then the mood. Needs cron, a key and a device. |
| 2 | A task due tomorrow 4pm for an hour appears on the LifeOS calendar within 10s; dragging it to 5pm updates the task within 10 min | built, unverified | DB trigger `tasks_gcal_ai` → `gcal_outbox` → `drainOutbox()`, which `lib/domain/tasks.ts` now calls right after a scheduled task is written (and the cron tick retries); `pollCalendar()` runs on the 10-minute tick. Needs Google credentials. |
| 3 | Renaming in chat updates the event; completing greys it; deleting the event unschedules the task with a note | built, unverified | `lib/google/sync.ts` (`✓ ` prefix + `colorId: '8'` on done; deletion clears `due_at` and posts via `notify()`). |
| 4 | "did gym" checks in and returns the streak; a not-due day does not break it | partly verified | The streak rule is **verified** in `tests/unit/progress.test.ts` and `tests/unit/schedule.test.ts` (`habitDueOn`, skip-not-due, break-on-missed). The chat tool `habit_checkin` returning it is built, unverified. |
| 5 | Sync still works after 8 days | built, unverified | Only provable by elapsed time. The mitigation is in `SETUP.md` step 6: set the Google consent screen to **In production**, or refresh tokens expire after 7 days. |

## Part 3: Money and analytics

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | "Spent 200 with my brother, half his" → paid 200, share 100, owed +100 brother; wallet shows +100 green and cash down 200 | **verified** (maths and views) | `tests/sql/schema.test.ts` reproduces the row set against the real `v_owed_by_label` / `v_wallet` / `v_account_balances`; `tests/unit/money.test.ts` covers the same rule in TypeScript. The chat phrasing needs an API key. |
| 2 | "Brother paid me back 100 on GPay" zeroes that label and raises GPay by 100 | **verified** (database half) | `tests/sql/schema.test.ts` — a `+100` settlement against `brother`. |
| 3 | "Ravi paid 600 for dinner for 3 of us" → paid 0, share 200, I owe 200 red | **verified** (maths and views) | Same two test files. The agent maps it to `{amount: 0, total: 600, split_with: 3}`. |
| 4 | The month-end message lists both owed lists and the net | built, unverified | `lib/jobs/tick.ts` month-end job, idempotent on `settle:<YYYY-MM>`, with a next-morning follow-up. |
| 5 | Analytics numbers match hand-checked SQL on a seeded dataset | **verified** | `tests/sql/schema.test.ts` asserts `v_goal_progress` (`done_min` 90, `total_min` 210, `remaining_min` 120, `unestimated` 2) and the 30-minute effort fallback on a hand-built fixture; `tests/unit/progress.test.ts` checks progress %, remaining hours, velocity fallback and the projected date. |

## Commands that pass here

```
npm run typecheck     # clean
npm run lint          # clean
npm run build         # 20 routes, service worker bundled
npm run test          # 9 files, 91 tests
```
