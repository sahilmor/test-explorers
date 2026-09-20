# School Online Test Manager

A platform for schools to run their own internal tests and assessments online
instead of on paper.

**Status: Phase 5 — sitting a test.** Grading and results come next.
What works: school signup, login/logout, role-gated areas, hard separation
between schools, the admin screens that populate a school, a question bank
filled by hand or CSV, papers built from that bank and scheduled to sections —
and students actually sitting them, with autosave that reaches the database on
every change, a server-owned countdown, and submission that happens whether or
not the student's browser is still alive.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)
- MongoDB via [Mongoose](https://mongoosejs.com)
- Deployed on [Vercel](https://vercel.com)

## Layout

| Path                       | What it is                                                     |
| -------------------------- | -------------------------------------------------------------- |
| `lib/auth.ts`              | **The single auth module.** Tokens, guards, cookies              |
| `lib/accounts.ts`          | Signup (transaction + rollback fallback), password checking      |
| `lib/db.ts`                | Mongoose connection helper, cached across hot reloads            |
| `lib/validation.ts`        | Zod schemas — note that none of them accept a `schoolId`         |
| `lib/school-setup.ts`      | Sections, subjects, teachers, students, CSV import               |
| `lib/csv.ts`               | The CSV reader, shared by the browser preview and the server     |
| `models/School.ts`         | `School` { name, slug, plan, planValidUntil }                    |
| `models/Section.ts`        | `Section` { schoolId, name, grade }                              |
| `models/Subject.ts`        | `Subject` { schoolId, name }                                     |
| `models/Question.ts`       | `Question` { schoolId, subjectId, text, imageUrl, options[4], correctOptionIndex, difficulty, createdBy } |
| `lib/question-bank.ts`     | Question list/paging/filters, CRUD, CSV import, per-subject counts |
| `lib/questions-shared.ts`  | Question constants with no Mongoose import, safe in the browser  |
| `models/Test.ts`           | `Test` { schoolId, title, subjectId, durationMinutes, questionIds, opensAt, closesAt, createdBy, status } |
| `models/TestAssignment.ts` | One row per section a test is assigned to                        |
| `lib/tests.ts`             | Test CRUD, assignment, auto-generation, the student's list       |
| `lib/tests-shared.ts`      | Test constants and `testState` / `humanGap`, safe in the browser |
| `models/Attempt.ts`        | `Attempt` { schoolId, testId, studentId, sectionId, startedAt, submittedAt, status, responses[], lastSavedAt } |
| `lib/attempts.ts`          | Start/resume, autosave, submit, and the sweep                    |
| `lib/sweep.ts`             | The opportunistic sweep run by ordinary requests                 |
| `components/sitting/`      | The exam screen and its autosave engine                          |
| `models/User.ts`           | `User` { schoolId, name, email, passwordHash, role, sectionId, subjectIds, sectionIds } |
| `app/signup`, `app/login`  | The two auth screens                                             |
| `app/admin\|teacher\|student` | Role areas, each gated server-side in its `layout.tsx`        |
| `app/api/auth/*`           | signup / login / logout                                          |
| `app/api/users*`           | School-scoped user list and read/update, for the isolation test  |
| `app/api/sections*`        | Section list / create / rename / delete                          |
| `app/api/subjects*`        | Subject list / create / rename / delete                          |
| `app/api/teachers`         | Teacher list (searchable) and create                             |
| `app/api/students*`        | Student list (search + section filter), create, CSV bulk import  |
| `app/admin/*`              | The four setup screens plus the overview checklist               |
| `app/api/questions*`       | Question list (paged, filtered), CRUD, CSV import, summary       |
| `app/api/uploads/*`        | Question diagram upload to Vercel Blob                           |
| `app/teacher/question-bank`| The question bank, open to teachers and admins                   |
| `app/teacher/tests`        | Create, edit, assign and schedule papers                         |
| `app/api/tests*`           | Test CRUD, assignment, random question selection                 |
| `app/api/student/tests`    | A student's own list — no parameters, so no other class to ask for |
| `app/student`              | "My Tests", with upcoming / open / closing-soon states           |
| `app/student/(exam)/tests/[id]` | Sitting a paper. No app chrome, on purpose                  |
| `app/api/attempts/*`       | Start/resume, autosave, submit                                   |
| `app/api/cron/sweep-attempts` | Force-submits attempts whose deadline has passed              |
| `app/globals.css`          | **The design system** — palette, type scale, shadows, motion     |
| `proxy.ts`                 | Convenience redirect only. Not a security boundary               |
| `tests/`                   | Tenant-isolation suite against a real server and a real database |

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your env file and fill in `MONGODB_URI`:

   ```bash
   cp .env.local.example .env.local
   ```

   Use either a local MongoDB (`mongodb://127.0.0.1:27017/school-online-test-manager`)
   or an Atlas connection string — see [docs/setup.md](docs/setup.md).

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000, then hit http://localhost:3000/api/ping. A
   successful response looks like:

   ```json
   { "ok": true, "wrote": "…", "readBack": { "message": "ping at …" }, "totalPings": 1 }
   ```

## Environment variables

| Name                    | Required | Description                                           |
| ----------------------- | -------- | ------------------------------------------------------ |
| `MONGODB_URI`           | yes      | MongoDB connection string                              |
| `JWT_SECRET`            | yes      | Signs session tokens. 32+ chars. Changing it signs everyone out |
| `BLOB_READ_WRITE_TOKEN` | no       | Vercel Blob, for question diagrams. Without it, image upload returns a clear 501 and everything else works |
| `CRON_SECRET`           | no       | Protects the sweep endpoint. Without it the scheduled sweep is refused in production; correctness does not depend on it |

`.env.local` is gitignored. Never commit real credentials.

## Setup guides

Atlas cluster creation and Vercel deployment are written up in
[docs/setup.md](docs/setup.md).


## Tests

```bash
npm test
```

That builds the app, starts a throwaway MongoDB replica set and the real
production server, and drives them over HTTP — no mocks and no test-only
bypasses. 80 cases covering tenant isolation, the whole school-setup flow, and
CSV parsing. See [docs/tenant-isolation.md](docs/tenant-isolation.md) for what
each case covers and how to confirm the tests actually have teeth.

`npm run test:only` skips the rebuild when `.next` is already current.

## Design system

The look is defined once in [`app/globals.css`](app/globals.css) and everything
inherits from it: warm paper, near-black ink, acid lime as the primary, coral
and cobalt as accents, hard offset shadows instead of soft ones, Bricolage
Grotesque for display type and Instrument Sans for body.

New screens should use those tokens (`bg-lime`, `border-ink`, `text-display-lg`,
`shadow-[5px_5px_0_var(--ink)]`) rather than introducing new colours or fonts.
Retheming shadcn means editing the semantic aliases in that file — the
components themselves read `--primary`, `--background` and friends.


## Importing students

An admin drops a CSV on the Students screen with three columns — `name`,
`email`, `section`. The section has to match a section that already exists in
the school, by name, case-insensitively.

The file is parsed in the browser first so the admin sees every row and what
will happen to it before anything is created. On confirm, the raw file is sent
to the server, which parses it again with the same module — the browser's parse
is for showing, not for deciding.

One bad row never sinks the batch. Each row is validated on its own, the good
ones are created, and every skipped row comes back with the line number it came
from and the specific reason: missing name, missing or malformed email, missing
section, a section that doesn't exist, an email that already has an account, or
an email that appears twice in the same file.

Imports are capped at 300 rows per file. Each new student needs a hashed
password, and that is the slow part — the cap keeps a single import inside the
function timeout. Larger intakes go in as several files.


## The question bank

Teachers and admins share `/teacher/question-bank`. Students cannot reach it —
the route's layout gate allows only those two roles, and every question
endpoint is wrapped with `roles: ["teacher", "admin"]`.

A question is always four options with exactly one correct, because that is
what the test-taking UI will render. The add/edit form makes the whole option
row the radio's label: clicking anywhere on it marks that option correct, and
the selected row lifts onto a hard shadow with a filled letter badge. A small
radio dot is not enough signal for the one field where a mistake silently
produces a wrong answer key.

The CSV import is the same component as the Phase 2 student import, configured
differently — `components/admin/csv-import-flow.tsx`. Columns are `subject`,
`question`, `optionA`–`optionD`, `correct` and `difficulty`. `correct` accepts
A–D or 1–4, because spreadsheets export both. Subjects resolve by name within
the importing school only. Imports are capped at 500 rows per file.

The stat row at the top counts questions per subject, zeroes included, and each
chip doubles as a subject filter. The zeroes are the point: they show where the
bank is thin, which matters once test creation needs "pick N questions from a
subject".


## Tests and their windows

A `Test` carries `opensAt` and `closesAt`, and a `TestAssignment` row per
section it is set for. A draft has no assignment rows at all — that is what
"not visible to students" means here, enforced in one place rather than trusted
at every read. Un-publishing a paper back to draft therefore withdraws it from
every class.

The stored `status` is `draft`, `scheduled` or `published`, set from the
teacher's intent and the opening time at the moment they saved. It goes stale
the instant a scheduled paper's opening time arrives, so **nothing important is
decided from it**. `testState()` recomputes `draft | scheduled | open | closed`
from the dates on every read, which means a paper opens and closes on time with
no cron job and no rows to flip over. The teacher's list, the student's
dashboard and the sit-a-test route all go through it.

Auto-generation uses MongoDB's `$sample` so the shuffle happens in the database
rather than by pulling the whole bank back. If the bank is smaller than the
teacher asked for, it returns what exists and says so rather than quietly
producing a short paper — and the Phase 3 per-subject counts are shown in the
subject dropdown so the shortfall is visible before the request is even made.


## Sitting a test

The screen at `/student/tests/[id]` has no navigation and no app chrome — just
the paper, a countdown and a save indicator. Two guarantees hold it up.

**The autosave reaches the database.** Every answer and every review toggle is
queued and written, keyed by question id so three changes of mind are one
write. A failed request puts its answers back in the queue and retries with
backoff, and the indicator says "Saving…", "Reconnecting…" or "Saved" — it says
"Saved" only when the server has confirmed the write. On `pagehide` a
`keepalive` request flushes whatever is still pending. The tests read answers
back out of MongoDB directly rather than through the API that wrote them, so an
endpoint that returned 200 and stored nothing would fail them.

**The deadline is the server's.** It is `min(startedAt + durationMinutes,
test.closesAt)`, computed on the server and re-checked on every request that
touches an attempt. The client ticks locally for smoothness but re-asks the
server every 20 seconds and corrects its own clock offset, so drift or a
sleeping laptop buys nobody extra time. A save arriving after the deadline is
refused and submits the attempt on the way out.

Three things submit a paper, in descending order of how much they need the
student's browser:

1. The student presses Submit, after a confirmation showing the unanswered count.
2. Their tab notices the clock hit zero, flushes and submits.
3. Nothing at all: the sweep force-submits expired attempts. It runs from
   Vercel Cron *and* opportunistically on ordinary student and teacher
   requests. The cron is scheduled daily because Hobby plans refuse to deploy
   anything more frequent — on Pro, tighten `vercel.json` to `*/5 * * * *`. On
   Hobby the opportunistic sweep is what keeps things tidy minute to minute.

   Correctness never depends on either: an expired attempt is force-submitted
   the moment anyone reads or writes it, so no student ever sees a live paper
   past their deadline even if no sweep has run at all.

The payload sent to a student's browser has question text and options and
nothing else. There is no `correctOptionIndex` field to read out of the network
tab, and a test asserts on the literal bytes.
