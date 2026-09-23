# Shalasys

A platform for schools to run their own internal tests and assessments online
instead of on paper.

**Status: Phase 8 — launch prep. Feature-complete.**
What works: school signup, login/logout, role-gated areas, hard separation
between schools, the admin screens that populate a school, a question bank
filled by hand or CSV, papers built from that bank and scheduled to sections,
students actually sitting them — with autosave that reaches the database on
every change, a server-owned countdown, and submission that happens whether or
not the student's browser is still alive — and every submitted paper marked in
the same breath, with results, an answer-key review, per-question class
accuracy and a section leaderboard that all stay sealed until the window
closes — and a plan that actually decides what a school may do, with a real
Razorpay payment as the thing that changes it.

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
| `lib/grading.ts`           | Marking. The only place a score is worked out                    |
| `lib/results.ts`           | Results, class analysis, leaderboard — and the visibility gate   |
| `components/results/`      | The result, teacher analysis and leaderboard screens             |
| `lib/plans.ts`             | Prices, caps, trial length — no Mongoose, so the UI shares them   |
| `lib/entitlements.ts`      | **The only place a plan rule is written.** Every `assertCan…`     |
| `lib/errors.ts`            | `SetupError`, on its own so entitlements can subclass it          |
| `lib/razorpay.ts`          | Orders and the two signature checks, over REST. No SDK            |
| `lib/billing.ts`           | Opening a payment, applying a verified one, recording a failure   |
| `lib/dashboard.ts`         | The admin overview's numbers. Every one of them a query           |
| `lib/platform.ts`          | The owner view — the one module that reads across tenants         |
| `lib/notifications.ts`     | Who gets told what, once. Throws nothing, ever                    |
| `lib/email/send.ts`        | Resend over REST. Never throws; no key means a log, not a failure |
| `lib/email/templates.ts`   | The two emails, inline-styled because clients strip everything    |
| `lib/observability.ts`     | Error reporting. A no-op without a DSN                            |
| `lib/config-audit.ts`      | What this deployment actually has configured                      |
| `lib/site.ts`              | The canonical origin, for links, sitemap and OG tags              |
| `models/Notification.ts`   | One row per person per thing. The unique index is the lock        |
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
| `app/api/attempts/[testId]/result` | One student's own result, once the window has closed      |
| `app/api/tests/[id]/results`| The class picture for a paper, for teachers and admins          |
| `app/api/student/results`  | A student's own results across every closed paper                |
| `app/api/student/leaderboard` | Cumulative standings inside the student's own section         |
| `app/student/tests/[id]/result` | Score, breakdown, rank and the answer key                   |
| `app/student/leaderboard`  | The class table, the student's own row highlighted               |
| `app/teacher/tests/[id]/results` | Distribution, worst questions first, every student         |
| `app/admin/billing`        | Plan, price, and every payment attempt                           |
| `app/api/billing/order`    | Opens a Razorpay order. Amount comes from the plan, never a body |
| `app/api/billing/verify`   | The Checkout callback, signature-checked before anything moves   |
| `app/api/billing/webhook`  | Razorpay's own account of a payment. The authoritative path      |
| `app/platform`             | Every school and what it is worth. Owner only, 404 for everyone else |
| `app/page.tsx`             | The landing page, written for the principal not the student      |
| `app/pricing`              | Public pricing, every number imported from lib/plans.ts          |
| `app/privacy`, `app/terms` | Legal pages, with the operator's details still to fill in        |
| `app/robots.ts`, `app/sitemap.ts` | Crawl rules and the public page list                      |
| `app/opengraph-image.tsx`  | The share card, generated so it cannot drift from the brand      |
| `components/marketing/`    | The public shell and the legal page frame                        |
| `docs/launch-checklist.md` | **The pre-launch checklist**, and what is still outstanding      |
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

   Use either a local MongoDB (`mongodb://127.0.0.1:27017/shalasys`)
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
bypasses. 275 cases covering tenant isolation, the whole school-setup flow,
CSV parsing, the question bank, papers and their windows, sitting a paper, and
marking and results, billing with its enforcement, and notifications. See [docs/tenant-isolation.md](docs/tenant-isolation.md) for what
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


## Marking and results

**A paper is marked the moment it is handed in.** Every path that ends an
attempt — the student pressing Submit, their tab noticing the clock hit zero,
and the sweep force-submitting a closed laptop — goes through the same
`finishAttempt` in [`lib/grading.ts`](lib/grading.ts), which writes the status
and the mark in one update. There is no queue and no second pass, so
"submitted but never graded" is unreachable rather than merely unlikely.

The mark is worked out from the test's `questionIds`, not from the responses: a
question the student never opened still counts towards the total, as
unanswered. Blank is counted as blank, never as wrong. Every count is written
with `$set`, so re-running the marking on an already-marked attempt produces
the same numbers rather than adding to them — `regradeAttempt` exists for that
and is safe to run twice.

**Nothing is visible until the window has closed for everyone.** A single
guard in [`lib/results.ts`](lib/results.ts) answers one question — is
`now >= test.closesAt`? — and every result, answer key, class analysis and
leaderboard entry is behind it. It is enforced in the data layer, not in the
page, so a student who guesses the URL of their own result gets the same 403
that the UI would have shown them. Marks are computed and stored the whole
time; they are simply not handed out. The tests prove both halves: attempts are
already graded in the database while the API is still refusing to show them.

**The student's screen** leads with the score, then correct / wrong / blank,
then rank within their own section, then the paper itself with their answer and
the right one side by side. Right and wrong are labelled as well as coloured.

The gate covers the teacher too. While a paper is open their results screen
says when it unlocks and nothing else — sections often sit the same paper at
different times, and a mark read out early is a mark that can be passed on.
Watching a sitting in progress is a different question and a different screen.

**The teacher's screen** at `/teacher/tests/[id]/results` opens with the
distribution and then the thing worth reading — every question sorted worst
first, the three under 60% flagged. Students who never sat the paper are their
own row, "Not attempted", and sink to the bottom of every sort: not attempting
is a different fact from scoring zero, and averaging them together would flatter
or damn a class for the wrong reason.

**The leaderboard** is cumulative across every closed paper and scoped to the
student's own section — a student cannot ask for another class's table because
the endpoint takes no parameters. Ranking is competition-style, so two students
on 100% are both 1st and the next is 3rd.

**Once anyone has sat a paper it freezes.** Changing its questions or subject
after the first attempt is refused with a 409, because those attempts were
marked against the paper as it stood.


## Plans, payment and what they gate

A billing model that does not change what anyone can do is a spreadsheet with
extra steps, so the rules come first and the payment second.

**One plan.** ₹9,999 a year per school, up to 500 students. A new school gets
30 days of trial and 50 student places, set at signup rather than inferred
later, so revising the trial for new signups never moves an existing school's
cap underneath it.

**The stored plan is not trusted.** `School.plan` goes stale the moment
`planValidUntil` passes, exactly as `Test.status` does when a window closes.
`effectivePlan()` in [`lib/plans.ts`](lib/plans.ts) recomputes from the dates
on every read, so a trial that ran out overnight is expired on the next
request with nothing having had to run in between. The owner view shows both,
side by side, and they disagree all the time.

**Enforcement is one file.** [`lib/entitlements.ts`](lib/entitlements.ts) holds
every plan rule; `createTest`, `createStudent`, the CSV import and
`startOrResumeAttempt` each call one `assertCan…` at the top and then get on
with their work. Same arrangement as `withAuth` from Phase 1: one place to
read, one place to change, and no chance of a new route shipping without the
check because somebody forgot to paste it in.

What expiry stops is growth — new papers, new students, new sittings. It never
stops reading. An expired school signs in and sees every paper, every mark and
every student exactly as before, because losing access to your own data over a
lapsed invoice is how you lose a customer permanently. It also never stops a
sitting already in progress: a student mid-paper keeps saving and still
submits, and Phase 6 still grades them. Their work is theirs.

At the cap, adding one student is refused with the numbers in the message. A
CSV import is different — it fills the places that are left and skips the rest
with a per-row reason, the same way it already reports duplicates, rather than
refusing a 300-row file over the last four.

**A payment is only real once a signature checks out.** Nothing about a school
changes on the browser's say-so. The Checkout callback is verified with
`HMAC_SHA256(order_id|payment_id, key_secret)`, and then Razorpay is asked
directly what the payment's status and amount actually were — a valid
signature proves the message is ours, not that the money arrived or that the
right amount did. A forged signature, a declined card and a short payment all
leave the school exactly as it was, and each is recorded as a failed attempt
so "I paid and nothing happened" is answerable.

The webhook is the authoritative path, not the callback: a customer whose
laptop dies between paying and being redirected still gets their plan. Both
arrive for the same money, and Razorpay retries webhooks, so applying a
payment is guarded on the order still being unpaid — whichever arrives second
reports that it was already done rather than selling a second year.

Renewing early adds to the time left instead of discarding it.

**Payments are optional to run.** With no `RAZORPAY_KEY_ID`, the app works
exactly as before, the billing page says plainly that payments aren't switched
on, and the order route answers 501 rather than faking a checkout.
[docs/setup.md](docs/setup.md) Part 3 walks through getting test keys.

## The owner view

`/platform` lists every school, its plan and its revenue, and is the only
screen in the app that deliberately reads across tenants. It is gated on the
signed-in user's own email being in `PLATFORM_OWNER_EMAILS` — no new role, so
nothing about the tenant model changes, and no secret in a URL to end up in a
log. Everyone else gets a 404, including signed-out visitors: redirecting them
to a sign-in page would advertise that the route is real.

Revenue counts captured payments and nothing else. An order that was opened
and abandoned is not money, and counting it would be the quickest way to start
lying to yourself about the business.


## Notifications

Two emails, and nothing else. No marketing, no digest, nothing to unsubscribe
from.

| When | To | Carrying |
| --- | --- | --- |
| A paper is published or assigned | Every student in that class | Title, subject, question count, duration, the window |
| A paper's window closes | Every student who sat it | Their score and a link to the full review |

**Once each.** The triggers all repeat — a teacher pressing save on the assign
dialog again, the sweep running on every request, two tabs racing — so the
send is claimed by inserting a row whose unique index does the arbitration
(`models/Notification.ts`). The insert *is* the lock: whoever's succeeds owns
the send, and a duplicate-key error is the answer rather than a problem.
Reassigning a paper to a class that already has it mails nobody; adding a new
class mails only that class.

**Nothing here can break anything else.** An email is a courtesy on top of an
action that has already succeeded, so `sendEmail` never throws — a missing key,
a refused request or a timeout all come back as a result the caller carries on
from — and the notification functions catch everything above that too. With no
`RESEND_API_KEY` at all the app logs what it would have sent and continues.
There is a test that turns the mail provider off mid-run and checks the paper
is still assigned, still visible to students, and still sittable.

The result email is driven off the same `closesAt` the results gate uses, so it
can never arrive before the result it links to is visible — a student clicking
through to a 403 would be worse than no email. Both sends run in `after()`, so
they happen once the response has already gone out.

## The public site

`/` is written for the person who signs the cheque — the weekend a unit test
costs a department, and the fact that this is the school's own system rather
than a marketplace their students get advertised on. `/pricing` imports every
number from `lib/plans.ts`, the same module the checkout charges from, so a
price on a marketing page cannot drift from the price actually taken.

`/privacy` and `/terms` describe the software accurately and leave the
operator's own details as conspicuous highlighted placeholders. They need a
lawyer before launch; the checklist says so.

`robots.txt` keeps crawlers out of the app, `sitemap.xml` lists only public
pages, and the share card at `/opengraph-image` is generated from the palette
rather than checked in as a PNG that would quietly go stale.

## Before launching

[docs/launch-checklist.md](docs/launch-checklist.md) is the list, and most of
it is checkable rather than recalled: `/platform` reads the running process and
reports what is actually configured, including the expensive mistake of a
production deployment still holding Razorpay **test** keys.

Two things are outstanding by design and are written down there rather than
quietly skipped: the Atlas network allowlist is `0.0.0.0/0` with
credential-only access (a known Vercel-on-Hobby trade-off), and the legal pages
need their placeholders filled and a lawyer's read.
