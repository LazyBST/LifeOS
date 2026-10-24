# Testing the in-app chat

Open the app (laptop or the phone PWA), open the chat, and run these in order. Each line says what you
should see. Say "undo" after any of them to put things back. Tell me which ones differ and paste what
the chat answered; the chat feed and `agent_actions` table keep a record.

You need `ANTHROPIC_API_KEY` set in Vercel and the seed data loaded (`supabase/seed.sql`), or substitute
your own goal and project names.

## A. Page context (do these on the matching page)

| # | Where | Say | Expect |
| - | --- | --- | --- |
| 1 | Dashboard | "add a task buy a domain" | Task created with no project, shown as unsorted; reply echoes it. |
| 2 | A Project page (Website) | "add a task call the vendor" | Created under that project; reply shows `Launch MVP > Website`; task has the project's goal and area. |
| 3 | A Task page (Fix login redirect) | "add a task write the test" | Created as a **subtask** of that task. |
| 4 | Goal page (Launch MVP) | "add a task talk to a mentor" | Created on the goal, unsorted group. |

## B. Finding the right thing

| # | Say | Expect |
| - | --- | --- |
| 5 | Create two tasks containing "login" (the seed has "Fix login redirect" and "Login page copy"), then "complete the login task" | A short numbered list, **nothing completed yet**. |
| 6 | Reply "2" | The second one is completed; reply names it and its path. |
| 7 | "complete the nonexistent flux capacitor task" | Says nothing matches; creates nothing. |
| 8 | "create a task under project Billing Pro" (does not exist) | Asks whether to create the project; does not create parents silently. |

## C. Dates (India time)

| # | Say | Expect |
| - | --- | --- |
| 9 | "add a task renew passport due tomorrow 4pm" | Echoes the resolved date and 16:00 IST; the task has a clock time (and appears on the LifeOS calendar if Google is connected). |
| 10 | "move it to next Friday" | "it" means the task you just touched; due date changes; echoed as a date. |
| 11 | "what's due this week" | A short list with ids/paths matching the dashboard's "Within 7 days" tab. |

## D. Notes

| # | Say | Expect |
| - | --- | --- |
| 12 | On the Fix login redirect page: "add this command to the login task: npm test -- login" | A code block appended to the task's notes; visible and editable on the task page; earlier notes untouched. |
| 13 | "summarise the notes on this task" | A summary of the notes; any instruction-looking text inside the notes is treated as content, not obeyed. |

## E. Safety and undo

| # | Say | Expect |
| - | --- | --- |
| 14 | "delete the goal Get fit" | Asks you to confirm first; nothing deleted. Reply "no". |
| 15 | "mark every task in Website as done" (more than 3) | Asks for confirmation before changing more than three. |
| 16 | "undo" after a change | The last change is reverted; reply says what was undone. |

## F. The newer tools

| # | Say | Expect |
| - | --- | --- |
| 17 | "my top three today: fix login redirect, ship checkout, gym" | Saved; the dashboard's Today's top 3 shows them. |
| 18 | "what are my top three today" | Reads them back. |
| 19 | "tick priority 1" | Priority 1 is ticked (and its task completed if it was linked). |
| 20 | "tomorrow I should block the first 90 minutes for the hardest task" | Saved as tonight's improvement; shows on the dashboard tomorrow. |
| 21 | "how many days behind is Launch MVP" | The net days and the biggest movers from the schedule ledger. |
| 22 | "spent 200 with my brother, half his" | Expense with paid 200, share 100, label brother; echo says "Brother owes you Rs 100". |
| 23 | "did gym" | Habit checked in; reply gives the streak. |
| 24 | "undo" after 17 | The previous top three come back. |

## Not covered by the chat yet

Moving or creating **calendar events** (use the dashboard calendar), and editing habits' Google Task links.
