# Tenant isolation: how it works and how it is proved

Every piece of data in this system belongs to exactly one school. The whole
security model rests on a single rule:

> **`schoolId` always comes from the verified JWT. Never from the request body,
> never from a query parameter, never from a URL segment.**

This document explains how that rule is enforced and how the test suite proves
it holds.

## How it is enforced

### 1. One module owns identity

[`lib/auth.ts`](../lib/auth.ts) is the only file that reads the session cookie
or verifies a token. Nothing else calls `jwtVerify`. Route handlers get their
identity by being wrapped:

```ts
export const GET = withAuth(async (request, auth) => {
  // auth.schoolId and auth.role are verified. There is no other source.
});
```

`withAuth` returns 401 before the handler runs if the cookie is missing,
unsigned, tampered with or expired, and 403 if a `roles` option is set and the
caller's role is not in it. Because the handler receives `auth` as an argument,
there is no code path where a handler forgets to check.

### 2. The school filter is part of the query, not a check afterwards

Scoped reads and writes put `schoolId` **inside** the query rather than fetching
first and comparing:

```ts
// app/api/users/[id]/route.ts
const user = await User.findOne({ _id: id, schoolId: auth.schoolId });
```

The id in the URL is attacker-controlled, so it is never used alone. A correct
id belonging to another school simply matches no document. That also means the
response is an ordinary 404 — identical to the 404 for an id that does not
exist anywhere — so the endpoint cannot be used to probe which ids are real.

### 3. The validation schemas have no `schoolId` field

[`lib/validation.ts`](../lib/validation.ts) defines `createUserSchema` without
`schoolId`. Zod strips unknown keys, so a request body containing
`"schoolId": "<some other school>"` is not rejected with an error — it is simply
discarded, and the new user is attached to `auth.schoolId`. There is nothing to
forget to sanitise.

### 4. Role gates run on the server

Each role area's `layout.tsx` calls `requireRole("admin" | "teacher" |
"student")`, which runs on the server before any markup is produced. A student
who types `/admin` is redirected to `/student` — the admin page is never
rendered and never sent.

[`proxy.ts`](../proxy.ts) also redirects signed-out visitors, but it only checks
whether a cookie is *present*. It is a convenience, explicitly not a security
boundary, and the layouts would still bounce anyone it let through.

## How it is proved

```bash
npm test
```

The suite in [`tests/`](../tests) does not mock anything. It:

1. starts a real MongoDB replica set (`mongodb-memory-server`),
2. starts the **production build** of the app with `next start`,
3. talks to it over HTTP with a cookie jar per tenant, exactly like a browser.

Two schools are created through the real signup endpoint. School A's admin then
holds a genuine, valid session — this is not an anonymous attacker, it is a
legitimate user of the system trying to reach data that is not theirs.

### What School A tries, and what must happen

| Attempt                                                        | Required result                          |
| -------------------------------------------------------------- | ---------------------------------------- |
| List users                                                      | Only School A's people come back          |
| `GET /api/users/<School B's admin id>` — the real, exact id     | 404                                       |
| `GET /api/users/<School B's student id>`                        | 404                                       |
| Compare that 404 with one for an id that exists nowhere         | Byte-identical status and body            |
| `GET /api/users?schoolId=<School B>`                            | Query parameter ignored; A's list only    |
| `PATCH /api/users/<School B's admin id>`                        | 404, and B's record is verified unchanged |
| `POST /api/users` with `"schoolId": "<School B>"` in the body   | Created **under School A**, not B         |
| The same, with `schoolId` in the query string as well           | Created under School A                    |

### And what an attacker with a forged cookie tries

| Attempt                                                              | Required result |
| --------------------------------------------------------------------- | --------------- |
| No cookie at all                                                       | 401             |
| A token with the right claims, signed with a different secret          | 401             |
| A correctly signed token that has expired                              | 401             |
| School A's real token with the payload swapped to claim School B       | 401             |

That last one matters most: it takes a genuine signature and a genuine header
and splices in a different payload, which is the attack a naive
base64-decode-the-JWT implementation would fall for.

### Confirming the tests actually have teeth

A test that passes for the wrong reason is worse than no test. To check this
suite fails when isolation breaks, remove the school filter from one query:

```ts
// app/api/users/[id]/route.ts — sabotage
const user = await User.findOne({ _id: id });
```

Then `npm test`. Three cases go red: the two direct cross-school reads, and the
one asserting that a foreign id is indistinguishable from a missing id. Put the
filter back and they pass again. This was verified when the suite was written.

## Other things the suite covers

- **Signup is atomic.** A school and its first admin are created in a
  transaction. On a standalone mongod, which cannot do transactions, it falls
  back to a two-step write that deletes the school again if the user insert
  fails. `tests/transaction-fallback.test.ts` covers recognising that case,
  including the wrapped error shapes Mongoose actually throws.
- **Login does not leak which emails exist.** A wrong password and an unknown
  account return an identical response, and the unknown-account path still runs
  a bcrypt comparison so the timing matches.
- **Roles are enforced.** A student's login redirects to `/student`, a student
  visiting `/admin` is redirected away server-side, and a student calling
  `POST /api/users` gets 403.
- **Logout really ends the session.** The cookie is cleared and the next
  request is 401.
- **The forms are safe without JavaScript.** A `<form>` with no `method`
  submits as GET, which would put the password in the URL, the server log,
  browser history and the `Referer` header. The forms declare `method="post"`
  with an action, the API accepts form-encoded bodies, and tests assert that a
  failed form login redirects back with a short error code and neither the
  email nor the password in the URL.


## Phase 2: the same rule, applied to school setup

Sections, subjects, teachers, students and the CSV import all go through the
same `withAuth` wrapper and the same "schoolId comes from the token" rule. Three
things are worth calling out, because they are where a multi-tenant app usually
springs a leak.

### Ids in a request body are checked, not trusted

An admin's own form submits real subject and section ids, so they look
trustworthy — but they are still client input. `assertOwnedIds` refuses the
whole request unless every id also matches this school:

```ts
assertOwnedIds(
  input.subjectIds,
  (ids) => Subject.countDocuments({ _id: { $in: ids }, schoolId }),
  "subjects"
)
```

It takes a counting function rather than a model so the school filter is written
at the call site, where a reviewer can see it.

### Filters can only narrow

The students list takes a `sectionId` query parameter. It is applied *on top of*
the school filter, never instead of it, so passing another school's section id
returns an empty list rather than that school's students. There is a test for
exactly that.

### The CSV import resolves sections by name, within one school

A file naming "Grade 9 - A" can only match a section belonging to the importing
school, because the lookup table is built from `Section.find({ schoolId })`. A
test has Northgate's admin upload a file full of Riverbend's section names: zero
rows are created, and every row is reported as "No section called …".

### Deletes refuse rather than orphan

Deleting a section that still has students returns 409 with the count, instead
of leaving students pointing at a section that no longer exists. Deleting a
subject is allowed — it cannot orphan anyone — and the response reports how many
teachers were unassigned as a result.

## Phase 3: the question bank

The same rule again, with two additions worth naming.

### A shared area still has a hard role gate

`/teacher/question-bank` is used by teachers *and* admins, so the `/teacher`
layout gates on `["teacher", "admin"]` rather than a single role, via
`requireAnyRole`. `/teacher` itself then narrows back to teachers only, so an
admin who lands on the teacher home is sent to `/admin`.

A student is in neither list. Their request is redirected in the layout before
any markup exists, and every question endpoint independently returns 403 — the
page gate and the API gate are separate checks, not one relied on twice.

### The subject id is checked, never trusted

Creating or editing a question sends a `subjectId`. `assertOwnedSubject` looks
it up with the school filter attached, so another school's subject produces a
400 rather than a question quietly linked across the tenant boundary. The CSV
import resolves subjects by *name*, against a map built from
`Subject.find({ schoolId })` — a file naming another school's subject matches
nothing and every row is reported as skipped.

### Confirming these tests have teeth too

Remove the school filter from two places in `lib/question-bank.ts`:

```ts
const query: QueryFilter<QuestionDoc> = {};        // was { schoolId }
Question.findOneAndUpdate({ _id: id }, …)          // was { _id: id, schoolId }
```

Then `npm test`. Four cases go red: the list leaking another school's
questions, the cross-school read, and both cross-school writes. This was
verified when the suite was written.

## Phase 4: tests and assignments

The same rule, with one new surface worth naming: the student dashboard.

### A student has no parameter to ask with

`GET /api/student/tests` takes nothing. The school comes from the token and the
section comes from the student's own record, looked up by the token's user id.
There is no `sectionId` to tamper with, because there is no `sectionId` in the
request at all.

A student whose record has no section gets an empty list — not a fallback to
the whole school's papers, which is the shape this kind of bug usually takes.
There is a test for exactly that.

### Ids in the body are checked, all three kinds

Creating a test sends a `subjectId`, a list of `questionIds` and a list of
`sectionIds`. Each is verified against the caller's school before anything is
stored, and the questions are additionally checked to belong to the chosen
subject — a stray question from another subject would quietly skew a paper that
is generated and marked per subject.

### Confirming these tests have teeth too

Remove the school filter from the teacher's list in `lib/tests.ts`:

```ts
const docs = await Test.find({}).sort({ createdAt: -1 }).lean();   // was { schoolId }
```

Then `npm test`. Three cases go red: the list leaking another school's papers,
and both cross-school writes.

Visibility has two independent layers — the `closesAt: { $gt: now }` query and
the `testState` filter after it. Removing either one alone changes nothing,
which is the point; removing both makes "a test drops off the dashboard the
moment it closes" fail. All of this was verified when the suite was written.

## Phase 5: sitting a test

Two new things worth naming.

### The answer key never leaves the server

The sitting payload selects only `text imageUrl options` from each question.
`correctOptionIndex` is not in the projection, so it cannot be leaked by
accident when that shape changes later. A test asserts on the literal JSON
bytes — `expect(raw).not.toContain("correctOptionIndex")` — and on the
server-rendered HTML too, because a student with devtools open is the most
motivated attacker this app has.

### An attempt is reachable only through its own student

Every attempt endpoint takes a *test* id, never an attempt id, and resolves the
attempt from `{ testId, studentId }` where `studentId` is the token's subject.
There is no attempt id to guess, and `loadContext` additionally checks that the
test is assigned to the student's own section before anything else happens.

A student in another section gets 404 from every one of them, including the
sitting page itself.

### Confirming these tests have teeth too

Make the autosave a no-op — the exact mistake this phase exists to avoid:

```ts
// lib/attempts.ts — sabotage
const result = { matchedCount: 1 };   // was an Attempt.updateOne(...)
```

Then `npm test`. Thirteen cases go red, including every one that reads an
answer back out of MongoDB, both auto-submit paths and the sweep. An autosave
that returns 200 and writes nothing cannot survive this suite. Verified when it
was written.


## Phase 6: marking and results

Results add a second axis to guard. Everything before this was "whose data is
it"; a result is also "may this be seen *yet*".

### The gate is one function, in the data layer

`assertResultsVisible` in [`lib/results.ts`](../lib/results.ts) answers a single
question — is `now >= test.closesAt`? — and every path that could reveal a mark
calls it before returning anything: the student's own result, the answer key,
the teacher's class analysis and the leaderboard. It throws a 403 with the same
message the UI shows.

It lives beside the query rather than in the page, so a student who types the
URL of their own result while the paper is still open is refused by the same
line of code that would have hidden the link. The mark is already in the
database at that point — it was written at submission — it is simply not handed
out.

A test asserts both halves at once: it reads the attempts straight out of
MongoDB, confirms every one carries a score, and *then* confirms the API still
answers 403. A gate that worked by not computing the mark would pass the second
check and fail the first.

### The leaderboard has no parameter to ask with

`GET /api/student/leaderboard` takes nothing. The section comes from the
student's own user record, loaded via the token, and the query filters on
`{ schoolId, sectionId }` together. There is no id to swap for another class's,
in the same way `/api/student/tests` has none.

Closed papers are the only ones it counts, so it cannot become a side channel
for a paper that is still open.

### A sat paper freezes

Once any attempt exists for a test, changing its `questionIds` or `subjectId`
is refused with a 409. Those attempts were marked against the paper as it
stood, and silently swapping questions underneath them would make every stored
mark a lie about a paper nobody sat.

### Confirming these tests have teeth too

Two sabotages, applied together:

```ts
// lib/grading.ts — sabotage 1: blank counts as wrong
if (chosen === null || chosen === undefined) { incorrectCount++; continue; }

// lib/results.ts — sabotage 2: no gate
function assertResultsVisible() { /* nothing */ }
```

Then `npm test`. Nine cases go red: the marking counts, the unanswered
handling, the recompute-safety check, and every case asserting that an open
paper's result, answer key, class analysis and leaderboard are refused.
Verified when it was written.
