# Importing from AppFlowy

What gets imported (from your local AppFlowy data): **goals, projects, tasks, habits**, their statuses, priorities,
Areas, deadlines, project → goal and task → project links, creation dates, completion dates for done tasks, and the
page body of each goal, project and task as notes (when it is stored on this computer).

What does not: the template sample databases (Trips, Flights, Vision Board, demo Income & Expense), the personal
contacts list, habit check-in history (there is none stored per day), and pages that AppFlowy only holds in the cloud.

How rows are mapped:

| AppFlowy | LifeOS |
| --- | --- |
| Goal status "In progress" / "Not started" / empty | active |
| Goal or project status "Not Prioritised" | paused |
| Task status Completed, or the Done box ticked | done (completion time = last edited time) |
| Task status "In progress" | doing; "Not started" or empty → todo |
| Task priority empty | P2 |
| Area (several chosen) | the first of Business, Health & Fitness, Relationships, Finances; "Miscellaneous" → none |
| Project with no goal (or a goal that was a template) | goal "Imported from AppFlowy (no goal)"; move it later and its tasks follow |
| Task in several projects | the first project |
| Habit "Mon to Fri", "Mon, Wed, Fri", "Daily" | days of the week, or every day |
| Habit with a Target and Metric | a count habit (e.g. Water, 3, Liters) |
| Template rows, blank titles, untouched "New Goal" placeholders, duplicates | skipped, and listed |

## Steps

1. **Quit AppFlowy**, then copy its data folder somewhere safe (never point the scripts at the live folder):

   ```bash
   cp -R "$HOME/Library/Application Support/com.appflowy.appflowy.flutter/data_beta.appflowy.cloud/<your user id>" /tmp/appflowy-copy
   ```

2. **Extract** the structure (no extra packages needed) and the page bodies (needs two packages):

   ```bash
   python3 scripts/appflowy/extract.py /tmp/appflowy-copy data/appflowy/dump.json
   python3 -m venv /tmp/af-venv && /tmp/af-venv/bin/pip install rocksdict y-py
   /tmp/af-venv/bin/python scripts/appflowy/extract_notes.py /tmp/appflowy-copy data/appflowy/notes.json
   ```

   `data/` is git-ignored: your personal data never gets committed.

3. **Run the migrations** `0012_books.sql` and `0013_external_ids.sql` in Supabase.

4. **Dry run**, which writes nothing and shows exactly what would be imported and skipped:

   ```bash
   npm run import:appflowy
   ```

5. **Import.** To keep what is already in LifeOS, add only `--apply`. To delete everything currently stored and start
   clean, add `--reset`: it lists the row counts per table, then requires you to type `DELETE`:

   ```bash
   npm run import:appflowy -- --apply --reset
   ```

   `--reset` removes goals, projects, tasks, subtasks, habits and check-ins, journal, reminders, plans, chat history,
   books, money transactions and accounts. It keeps your settings, Areas, statuses, categories, Google connection
   and push subscriptions. It also forgets the LifeOS calendar so old events cannot come back as tasks: afterwards,
   delete the old "LifeOS" calendar in Google Calendar if you no longer want it.

6. Import is safe to repeat: rows carry their AppFlowy id, so running it again adds only what is new.

The script reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (or `.env`).
