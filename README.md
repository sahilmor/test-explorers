# School Online Test Manager

A platform for schools to run their own internal tests and assessments online
instead of on paper.

**Status: Phase 3 — question bank.** There is no test creation,
assignment or test-taking yet. What works: school signup, login/logout,
role-gated areas, hard separation between one school's data and another's, the
admin screens that take a school from empty to populated, and a searchable
multiple-choice question bank that teachers and admins fill by hand or by CSV.

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
