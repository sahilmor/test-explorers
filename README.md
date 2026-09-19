# School Online Test Manager

A platform for schools to run their own internal tests and assessments online
instead of on paper.

**Status: Phase 1 — accounts, roles and tenant isolation.** There is no
question bank and no test-taking yet. What works: school signup, login/logout,
role-gated areas for admins, teachers and students, and hard separation between
one school's data and another's.

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
| `models/School.ts`         | `School` { name, slug, plan, planValidUntil }                    |
| `models/User.ts`           | `User` { schoolId, name, email, passwordHash, role, classId }    |
| `app/signup`, `app/login`  | The two auth screens                                             |
| `app/admin\|teacher\|student` | Role areas, each gated server-side in its `layout.tsx`        |
| `app/api/auth/*`           | signup / login / logout                                          |
| `app/api/users*`           | School-scoped user list and read/update, for the isolation test  |
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

| Name          | Required | Description                                           |
| ------------- | -------- | ------------------------------------------------------ |
| `MONGODB_URI` | yes      | MongoDB connection string                              |
| `JWT_SECRET`  | yes      | Signs session tokens. 32+ chars. Changing it signs everyone out |

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
bypasses. The suite's job is to prove that School A cannot read or write School
B's data. See [docs/tenant-isolation.md](docs/tenant-isolation.md) for what each
case covers and how to confirm the tests actually have teeth.

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
