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
