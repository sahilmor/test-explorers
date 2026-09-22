# Pre-launch checklist

Everything here is verifiable rather than remembered. Most of it can be
checked from the owner view at `/platform`, which reads the running process
and reports what is actually configured — see **Configuration** at the top of
that page, or `GET /api/platform` for the same thing as JSON.

A check you have ticked from memory is a check you have not done.

---

## 1. Environment variables

Open `/platform` **on the production deployment** and read the Configuration
panel. Anything marked `blocking` stops the app working; anything amber is a
decision to make.

| Variable | Needed | What happens without it |
| --- | --- | --- |
| `MONGODB_URI` | **Yes** | Nothing loads. |
| `JWT_SECRET` | **Yes** | Nobody can sign in. At least 32 characters. |
| `APP_URL` | Production | Email links and OG tags point at the wrong host. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | To take money | Billing page says payments are off; checkout answers 501. |
| `RAZORPAY_WEBHOOK_SECRET` | To take money | Every webhook is refused, so a payment whose browser never returns never activates. |
| `RESEND_API_KEY` | No | Assignments and results still work. Nobody is emailed. |
| `EMAIL_FROM` | Once a domain is verified | Mail sends from `onboarding@resend.dev`, which only reaches your own address. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No | Errors go to Vercel logs only. Nothing alerts you. |
| `PLATFORM_OWNER_EMAILS` | No | Falls back to the author's address. Set it. |
| `CRON_SECRET` | No | The scheduled sweep refuses; the opportunistic one still runs. |
| `BLOB_READ_WRITE_TOKEN` | No | Image upload returns 501; questions work without diagrams. |

Set them in **Vercel → Project → Settings → Environment Variables**, for the
Production environment, then **redeploy** — environment variables are read at
build and boot, so setting one without redeploying changes nothing.

- [ ] `/platform` on production shows zero `blocking` checks.
- [ ] Every amber check is one you have consciously decided to leave.

---

## 2. Database network access

MongoDB Atlas → your cluster → **Network Access**.

Vercel's serverless functions do not have stable outbound IPs on Hobby or Pro
without the Static IP add-on, so the honest position is one of:

1. **`0.0.0.0/0` plus strong credentials.** What most Vercel + Atlas projects
   run. The database is still authenticated and TLS-only; the allowlist is
   simply not doing any work. If you take this route, treat the connection
   string as the only thing standing between the internet and student data:
   a long generated password, never committed, rotated if it ever leaks.
2. **Atlas Private Endpoint / VPC peering** (Atlas dedicated tiers) or
   **Vercel Secure Compute**. The real answer, and it costs money.

- [ ] You have chosen deliberately, and written down which.
- [ ] The database user is scoped to *one* database, not cluster admin.
- [ ] The password is generated, at least 24 characters, and stored only in
      Vercel's environment variables and your own password manager.
- [ ] `MONGODB_URI` is not in git. (`git log -p -- .env.local` should be empty;
      `.env.local` is gitignored.)

**Current status:** `0.0.0.0/0` with credential-only access — a known trade-off
taken to get a Hobby-tier deployment working. Revisit before taking a paying
school with real student data.

---

## 3. Razorpay: test mode → live mode

This is the one that costs money to get wrong, in both directions. Test keys on
a live site take no money; live keys on a staging site take real money.

- [ ] A test-mode payment has completed end to end on production, and the
      school flipped to `active` with a new `planValidUntil`.
- [ ] Razorpay dashboard → account activated and KYC complete (live keys do
      not exist until it is).
- [ ] **Settings → API Keys → Live Mode → Generate Live Key.** The Key ID
      starts `rzp_live_`, not `rzp_test_`.
- [ ] `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel Production are the
      live pair. Keep the test pair on Preview.
- [ ] A **separate live webhook** exists at
      `https://<your-domain>/api/billing/webhook` with events
      `payment.captured` and `payment.failed`, and its secret is in
      `RAZORPAY_WEBHOOK_SECRET`. Test and live webhooks have different secrets.
- [ ] `/platform` → Payments reads **"Live mode. Real payments will be taken."**
      While it says *"LIVE deployment is using TEST keys"*, no school can pay you.
- [ ] The billing page no longer shows the "Test mode — no real money moves" note.
- [ ] One real payment of your own, refunded from the Razorpay dashboard
      afterwards. Nothing else proves the whole path.

---

## 4. Legal

- [ ] `/privacy` and `/terms` load and are linked from the public footer.
- [ ] Every `[highlighted placeholder]` on both pages is replaced — legal
      entity name, registered address, contact emails, jurisdiction, retention
      periods, data region. They are deliberately conspicuous.
- [ ] A lawyer in your jurisdiction has read both. Schools handling
      children's data will ask, and you are processing payments.
- [ ] The sub-processor list in the privacy policy matches what is actually
      configured — remove Sentry or Resend from it if you are not using them.

---

## 5. SEO and discoverability

- [ ] `/robots.txt` resolves and disallows `/admin`, `/teacher`, `/student`,
      `/platform`, `/api`.
- [ ] `/sitemap.xml` resolves and lists only public pages.
- [ ] `/opengraph-image` renders the brand card.
- [ ] Paste the production URL into WhatsApp or Slack and confirm the preview
      shows the title, description and image.
- [ ] `APP_URL` is set, so canonicals and OG urls are absolute and correct.
- [ ] The domain is verified in Google Search Console and the sitemap submitted.

---

## 6. Before the first school

- [ ] Sign up a real school end to end on production: add sections, subjects,
      a teacher, import students by CSV, write a paper, sit it on a phone,
      close it, read the results.
- [ ] Confirm both emails arrive in a real inbox — "test assigned" and
      "results published".
- [ ] `npm test` passes on the commit you deployed.
- [ ] Delete the rehearsal school's data from Atlas afterwards.
- [ ] Know how you will restore a backup. Atlas → Backup. Try it once on a
      copy before you need it for real.
