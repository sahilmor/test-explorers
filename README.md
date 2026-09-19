# School Online Test Manager

A platform for schools to run their own internal tests and assessments online
instead of on paper.

**Status: Phase 0 — project skeleton only.** There is no auth, no question bank
and no test-taking yet. All this phase proves is that the app builds, deploys,
and can read and write a document in MongoDB.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)
- MongoDB via [Mongoose](https://mongoosejs.com)
- Deployed on [Vercel](https://vercel.com)

## Layout

| Path                  | What it is                                              |
| --------------------- | ------------------------------------------------------- |
| `app/page.tsx`        | Placeholder home page                                     |
| `app/api/ping/route.ts` | Throwaway route that writes a doc and reads it back      |
| `lib/db.ts`           | Mongoose connection helper (cached across hot reloads)    |
| `lib/utils.ts`        | shadcn's `cn` helper                                      |
| `models/Ping.ts`      | Throwaway model — delete once real models exist           |
| `components/ui/`      | shadcn components                                         |

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

| Name          | Required | Description                 |
| ------------- | -------- | --------------------------- |
| `MONGODB_URI` | yes      | MongoDB connection string   |

`.env.local` is gitignored. Never commit real credentials.

## Setup guides

Atlas cluster creation and Vercel deployment are written up in
[docs/setup.md](docs/setup.md).
