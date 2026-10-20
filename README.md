# Where Do You Stand?

A working React + TypeScript + Vite application for Team Teeth’s small, in-person team session. A friendly phone survey feeds an organiser dashboard and a three-screen presentation. It is a conversation starter, **not a personality assessment**.

## 1. Try the fictional demo first (five minutes)

Install [Node.js 22 LTS or newer](https://nodejs.org/), unzip this project, and open a terminal in the folder containing `package.json`.

```bash
npm ci
npm run dev
```

Open the address Vite prints, normally `http://localhost:5173`.

- **Survey:** `http://localhost:5173/`
- **Organiser dashboard:** `http://localhost:5173/#/admin`
- **Presentation:** `http://localhost:5173/#/present`

With no environment variables, everything uses the demo. Eight fictional colleagues are ready to go. Demo results and settings live only in your browser's local storage; no network backend is needed. Participant drafts live in session storage, which normally clears when the tab is closed. Browser crash/session recovery may preserve them.

You can submit a ninth fictional person, correct that entry without duplicating it, close/reopen the survey, remove entries, export CSV and download a QR code. Under **Demo testing** in the dashboard, simulate network/photo failures or restore the original eight people. All eight original people chose the same Curiosity position, deliberately testing collisions. Other questions have varied answers. Everyone has an initials avatar, exercising the no-photo path. You can add your own test photo through the survey.

For a phone on the same Wi-Fi, use the Network URL printed by Vite. A phone camera may need HTTPS; the native file-picker camera option depends on device/browser support. The Take photo button opens an in-app live preview using the front-facing camera where available; the browser asks for camera permission. Participants can capture, retake and accept a selfie. Camera tracks stop on capture, cancel and closing the window. No microphone is requested. A denied or unavailable camera gives clear instructions and leaves Upload available. After deploying to GitHub Pages, use its HTTPS address for a realistic phone test. Do not use real colleagues' data in demo mode or on a development server.

Even after Supabase is configured, add `?demo=1` **before** the hash to force a completely separate fictional demo: `https://USERNAME.github.io/REPOSITORY/?demo=1#/admin`. Demo data never enters Supabase.

## 2. How the application is organised

```text
src/
  App.tsx             Survey, organiser dashboard and presentation components
  SelfieCamera.tsx     Camera permission, live preview, capture, retake and cleanup
  TeamTeethLogo.tsx    Responsive SVG team of teeth logo
  api.ts              Demo adapter, Supabase API adapter, image preparation
  data.ts             Exact question wording, groups, demo data, chart calculations
  main.tsx            React entry point
  style.css           Responsive design, projector layout, reduced-motion rules
supabase/
  config.toml         Edge Function gateway configuration
  migrations/         Complete schema, question catalogue, permissions, atomic RPCs
  functions/event-api/index.ts   Invitation, submission, admin and cleanup API
.github/workflows/
  deploy.yml          Test, build and deploy to GitHub Pages
  retention.yml       Daily deletion of expired responses and photographs
 tests/               DOM, data, demo API and PostgreSQL tests
 e2e/                 Optional actual-browser phone and 1080p tests
```

The front end is static. It uses hash routes so GitHub Pages doesn't need URL rewriting. The only public configuration is the Supabase project URL and **publishable** key (`sb_publishable_…`). All elevated database and storage operations happen inside the Edge Function. There are no secret keys in the front end.

The twelve question prompts in `data.ts` supply the main headings in the survey, review, organiser question catalogue, presentation and CSV export. The original spectrum endpoints and stable question IDs are preserved.

Answers use integers **0–24** internally. The midpoint is 12. Presentation positions use `Math.round(answer / 4)`, giving seven bins with both endpoints and the midpoint preserved. Questions remain in their original order in the presentation and CSV. The participant shuffle is created once per tab/event, saved with the draft, and stays fixed when going back.

## 3. Connect Supabase

The hosted Team Teeth site uses its configured Supabase project. The steps below explain how to reproduce that setup for a separate deployment. Never copy staff data between deployments.

### A. Create the project and apply the migration

1. Create a project at [supabase.com](https://supabase.com/dashboard). Choose an appropriate region (for this UK team, consider London). Save your database password privately.
2. In the project SQL Editor, paste and run the entire file `supabase/migrations/202610200001_initial.sql` **once**. This creates the schema, all twelve exact questions, restricted functions and private `portraits` bucket. Do not add public table/storage policies or remove the restrictive portrait policy.
3. Alternatively use the Supabase CLI from the project folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Use the editor OR `db push` for the initial migration, rather than applying it twice. Commit future schema changes as new migration files.

### B. Create and allowlist the organiser

1. In **Authentication → Users**, create your organiser user with your email address; mark the email as confirmed. An initial password can be generated privately; this app signs in with email codes.
2. Disable public new-user signups in your Auth settings. Leave Email sign-in enabled.
3. In **Authentication → Email Templates → Magic Link**, include the OTP code in the template, for example:

```html
<h2>Where Do You Stand?</h2>
<p>Your organiser sign-in code is: <strong>{{ .Token }}</strong></p>
<p>If you did not request this, ignore this email.</p>
```

The app deliberately uses a typed email code rather than a redirect link, avoiding conflicts between auth fragments and hash routing. Supabase controls OTP lifetime and email rate limits. Configure a suitable SMTP provider if the built-in email sender's limits or authorised recipient restrictions prevent delivery.

4. Add your user to the allowlist in the SQL Editor (replace the email):

```sql
insert into public.administrators(user_id)
select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com')
on conflict do nothing;

-- Confirm that your email matched one account:
select u.email from auth.users u
join public.administrators a on a.user_id=u.id;
```

Removing a row from `administrators` immediately revokes the next backend request. Each allowlisted organiser owns one separate session. The initial version doesn't support multiple organisers sharing one event.

### C. Configure and deploy the Edge Function

The hosted platform normally supplies `SUPABASE_URL` and a dictionary named `SUPABASE_SECRET_KEYS`. The function uses its `default` key (or the first available secret). If your environment does not supply that dictionary, set `APP_SUPABASE_SECRET_KEY` to a current `sb_secret_…` key in **Edge Functions → Secrets**. The old anon/service-role key model is not required.

Set these additional **server-only secrets** in the same place:

| Name                      | Example / purpose                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`         | `http://localhost:5173,https://YOUR-USERNAME.github.io` (origins only; no trailing slash, repository path or wildcard) |
| `CLEANUP_SECRET`          | A long random value, at least 32 characters; use 64 random hex characters                                              |
| `APP_SUPABASE_SECRET_KEY` | Optional fallback as described above; never a `VITE_` variable                                                         |

Generate a cleanup secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not commit the output. Keep it for the GitHub retention workflow too.

Deploy the function:

```bash
npx supabase functions deploy event-api --no-verify-jwt
```

`verify_jwt = false` is intentional: the same endpoint accepts accountless invitation submissions and authenticated organiser requests. The function itself verifies the organiser's user JWT with Supabase Auth, checks the database allowlist, and restricts every query to that organiser's event. An invitation alone cannot call admin actions. Do not remove these checks or assume that CORS is authorisation.

### D. Connect the front end

Copy `.env.example` to `.env` in the project root and set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Find the publishable key in your project's API settings. Restart `npm run dev` after changing `.env`. Both settings must be supplied together. `.env` is ignored by Git.

Open `/#/admin`, sign in with your emailed code, and click **Create session**. Copy the invitation displayed on the dashboard. Its format is:

```text
https://YOUR-FRONTEND/#/join/EVENT_UUID?invite=RANDOM_INVITATION
```

The secret invitation lives in the URL fragment, so it is not sent to GitHub Pages, request logs or referrers. The API receives it in a POST body. Treat the complete participant URL/QR as a private invitation for your eight colleagues.

The invitation is displayed only when generated; its hash is stored in the database. Keep your copied link. After a dashboard reload, choose **Generate new invitation** if you no longer have it; this invalidates the old link. A participant's existing tab retains its draft but must use the latest invitation to submit.

## 4. Create the GitHub repository and deploy

The Team Teeth repository is deployed through GitHub Actions. For a separate deployment, create a repository named, for example, `where-do-you-stand` in your own GitHub account. An empty repository is easiest; don't initialise it with a README. The archive contains all source, a lockfile and workflows, with no real participant data or credentials.

In a terminal in this project folder:

```bash
git init -b main
git add .
git commit -m "Build Where Do You Stand team activity"
git remote add origin https://github.com/YOUR-USERNAME/where-do-you-stand.git
git push -u origin main
```

If the extracted folder already has Git history, skip `git init` and the initial commit. Authenticate with GitHub when prompted. You can also use GitHub Desktop to add/publish the folder.

In the GitHub repository:

1. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** create `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public build-time variables; never put a secret key here. Leave both absent to publish the fictional demo first.
3. Under **Secrets**, create `CLEANUP_SECRET`, using the same value as the Supabase Edge Function secret. No Supabase elevated key is needed in GitHub.
4. Open **Actions → Deploy to GitHub Pages → Run workflow**, or push a change. The workflow lints, tests, builds and deploys.
5. Your URL will normally be `https://YOUR-USERNAME.github.io/where-do-you-stand/`. The workflow automatically sets Vite's repository base path. For an account-root repository or custom-domain root, change `BASE_PATH` to `/`.
6. Check that this exact origin is in `ALLOWED_ORIGINS` and use the **deployed** dashboard to generate the invitation, so the link contains the deployed address.
7. Run **Delete expired event data** manually once to verify it succeeds. It then runs daily at approximately 03:17 UTC. Scheduled workflows run from the default branch and may be delayed or disabled by GitHub on inactive repositories; monitor successful runs or use an external scheduler calling the same protected cleanup endpoint if you need stronger guarantees.

GitHub Pages hosts a public static front end. Authentication protects the live organiser data; hiding the admin URL alone would not. Public visitors can view the fictional demo. GitHub plan/repository settings determine whether Pages is available from a private source repository.

## 5. Running your session

Before the meeting, test with fictional names on the **live backend**, then delete those entries. Submit a real test photo too, verify its deletion, and restore your chosen open/closed state. Share only the current participant link, not the organiser dashboard URL. Colleagues need no account.

The organiser dashboard shows response counts/names and refreshes automatically every 15 seconds (plus whenever the window regains focus). There is also a manual refresh button. This is reliable polling rather than Realtime, avoiding public result subscriptions. CSV is organiser-only and uses raw 0–24 values; cells are quoted and formula-prefixed names neutralised.

In the presentation:

- Start on the title screen, then choose one of three themes.
- Each theme starts concealed; **Reveal results** only reveals that theme. **Hide results** resets it. Returning to a previously revealed theme keeps that theme revealed during the current presentation visit; leaving presentation mode resets all reveals.
- **← / →** move between screens; **R** or **Space** toggles the current reveal; **H** hides/shows the controls. Keyboard shortcuts are ignored while a button/form field has focus, so controls remain keyboard-operable normally.
- Full screen is available where the browser supports it. Some iPhones do not offer the standard full-screen API; this does not affect survey use. Use a desktop/laptop with a projector for presenting.
- Notes are optional; toggle them on for discussion. At smaller heights, notes may require scrolling; keep them hidden for the clearest 1080p overview.
- People share seven fixed positions. Busy slots use paired portrait/name stacks branching from the same position marker. Colours remain consistent across all questions. The original demo deliberately tests all eight people at one point.
- Most-aligned and biggest-spread insights are calculated from actual answers (variance and range), not generated or evaluative.

Corrections from the original tab reuse a random 72-character receipt and update the same database row. The receipt is never used to retrieve results. Retrying a timed-out submission with that receipt is safe. On another device or after losing the tab, ask the organiser to delete the original entry before resubmitting. Duplicate display names are rejected (case-insensitively); add an initial for two colleagues with the same first name. This protects against accidental duplication, rather than pretending to verify people's identities.

## 6. Security and privacy model

- Tables have RLS enabled, no browser-readable policies, and no anonymous/authenticated table grants. Browser clients cannot call the privileged submission/rate-limit SQL functions. The function's server-only secret has elevated access; guard it like a password.
- The private Storage bucket permits JPEG files only, capped at 400 KB. A restrictive Storage policy denies browser access to this bucket, including when another permissive policy exists in the project. Participants cannot list, retrieve or upload objects directly.
- Client-side canvas processing centre-crops/zooms to a 320×320 JPEG and strips metadata. The server validates, decodes with a memory/resolution limit, and re-encodes again, removing metadata even for a manually crafted submission. SVG/HTML and unsupported image types are refused. Filenames are random.
- Organisers receive signed portrait URLs valid for two minutes, refreshed during polling. A copied signed URL can be used until it expires; don't share exports or presentation screenshots outside the team.
- The Edge Function checks invitation hashes, event ownership, open/expired state, consent, name length, all twelve integer answers, request size and image validity. Database checks and an event row lock repeat critical validation inside the submission transaction.
- Rate counters are atomic, short-lived, and stored centrally: 180 API requests per IP per ten minutes, plus 30 submission attempts per event per ten minutes. This accommodates shared office Wi-Fi while bounding abuse. Proxy IPs are hashed before storing counters; no IP address is added to response records. This is intended for eight trusted invitees, not a public internet survey.
- Closing/purging a session takes the same event lock as submission. Removal deletes photos as well as records. A failure in storage cleanup leaves the event closed and the remaining records available for retry, instead of silently claiming deletion succeeded. Interrupted upload or replacement cleanup can leave an orphan photo; full event purge/retention cleanup removes those too.
- Default retention is 30 days **from session creation**, configurable from 1–90 days. Expired data cannot be read or submitted through this API, and the daily cleanup deletes photos and responses. Opening an expired dashboard also runs cleanup. Database/platform backups and provider logs follow your Supabase project policies; deleting application records is not an assertion that backup copies disappear immediately.
- A purge closes the survey but preserves its empty event/settings and allowlist. Reopen explicitly if collecting again. For an entirely fresh event/retention clock, first purge, then remove your empty event in the SQL Editor (`delete from public.events where owner='YOUR_USER_UUID'`) and create a session again in the dashboard. Purge first so storage files aren't orphaned by a SQL cascade.
- No facial analysis, tracking scripts, public result endpoint or participant result-reading capability is implemented. Hosted typography uses Google Fonts with system-font fallback; remove the first CSS `@import` to make typography entirely local.
- A small team can identify each person's answers. The welcome/profile notice makes this explicit and participation voluntary. Before using real staff data, decide who the organiser is, explain the purpose/deletion date, and follow your organisation's expectations for the chosen hosting/accounts.

## 7. Validation and testing

```bash
npm run lint
npm test
npm run build
npx --yes deno check --node-modules-dir=manual supabase/functions/event-api/index.ts
```

The automated tests cover data/wording, shuffling, missing responses, quantisation, all-eight stacking, computed insights, CSV escaping, survey navigation/review/submission/correction, concealed results, network/photo failures and demo duplicates/closure. PostgreSQL tests run the actual SQL migration inside PGlite, then check atomic replacement, duplicate names, invalid answers, expiry/invitations, central rate limiting and anonymous/authenticated permission denial. The tests mock Supabase's existing Auth/Storage schemas; they do not replace a live provider integration test.

Actual-browser tests (also run by GitHub Actions before deployment):

```bash
npx playwright install chromium
npm run test:e2e
```

These exercise a 390×844 phone viewport and all three 1920×1080 presentation screens, checking page overflow, portrait rectangle collisions and containment within each spectrum. They verify the twelve question headings across views and camera capture/retake/save/close using a simulated camera, plus denied-permission recovery. They never access a real camera in CI. Screenshots go to ignored `test-results/`. Check them visually, including a long display name, before the meeting. The actual browser/camera, live email delivery, deployed function, Storage/RLS policies and production scheduler still need verification in your own accounts.

Live security smoke checks after setup:

1. In an incognito window without signing in, open `/#/admin`: it must show sign-in and no results. Signing in as an existing, non-allowlisted user must also fail.
2. Use the valid participant link: complete the survey, then retry/correct from the same tab. Exactly one row should remain for that participant.
3. In that window's developer console, a direct `GET` of `SUPABASE_URL/rest/v1/responses?select=*` with only the publishable key in `apikey` must return permission denial. Repeat for `events` and `administrators`.
4. A POST to `/functions/v1/event-api` with `{ "action": "list" }`, without an organiser bearer token, must return 401. A valid invitation in the body does not change this.
5. Without organiser authorisation, use Supabase's Storage API to list/read `portraits`: it must not return any participant image or object listing. Do not create permissive Storage policies to troubleshoot uploads; uploads must pass through the function.
6. Turn the phone offline at submission: the review stays in place with an error, then succeeds safely after reconnecting. Try an invalid/oversized photo and remove it to continue without one.
7. Close the survey and confirm a participant cannot submit, even by making a direct API request. Test a rotated link, duplicate name, missing answer and a non-integer/out-of-range answer.
8. Remove one entry, then purge all. Verify both `responses` and the event's `portraits/EVENT_UUID` folder are empty. Run retention manually and check the Actions logs. Do not publish real responses or CSV files to Git.

## 8. First version and next iteration

**Implemented:** full survey, optional selfie/upload and centre crop/zoom, stable randomisation, deliberate 25-position choices, review/correction, functional local demo, genuinely authenticated/allowlisted Supabase API, private photographs, protected dashboard, polling, CSV/QR, event controls, deletion/retention, three presentation groups, controlled reveal, notes, fullscreen/keyboard/reduced-motion support, insights, schema, tests and GitHub Actions.

**Hosted configuration:** GitHub Pages and the Supabase backend have been provisioned for the Team Teeth deployment. Public build variables select live mode; the separate `?demo=1` preview keeps fictional data local. Organiser access uses an allowlisted Auth account and emailed codes. The cleanup credential is stored only as encrypted server/Actions configuration. For a new deployment, follow sections 3–4.

**Verification limits:** DOM tests, PostgreSQL tests, lint, TypeScript/build and function type checking can be run locally. Deployment checks include the live database permissions and unauthenticated API rejection. Physical phone, camera and projector checks still need to be performed by the organiser. GitHub Actions verifies phone and projector layouts and simulated-camera behaviour; physical device/camera checks and live Supabase integration still need verification.

**Possible second iteration:** movable crop positioning beyond centre/zoom, shared event ownership, multiple sessions per organiser, audit trail, a stricter CAPTCHA gateway if invitations are ever public, and an optional kiosk/presentation-only credential. The initial version intentionally uses one protected organiser session for the dashboard and presentation.
