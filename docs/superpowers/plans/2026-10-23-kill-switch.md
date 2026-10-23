# Kill Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an independently hosted admin application that stores and serves a disabled flag for each customer deployment.

**Architecture:** One Next.js App Router application serves a protected admin dashboard and public status route. PostgreSQL stores switch records and shared login throttling state. Server-side code uses parameterized `pg` queries; customer applications only consume the public status URL.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, `pg`, Node.js crypto, Oxlint, Vitest for focused server checks; plain CSS, no ORM or UI framework.

**Spec:** `docs/superpowers/specs/2026-10-23-kill-switch-design.md` (approved).

## Global Constraints

- Work only in `C:\Users\AndersonHo\Desktop\mine\outsource\kill-switch`; preserve the existing design and plan files.
- One administrator; no registration, customer accounts, or role management.
- One switch record per customer deployment; new records default to `disabled = false`.
- Names are trimmed and limited to 1-120 characters.
- `GET /api/status/{id}` returns exactly `{ "disabled": true }` or `{ "disabled": false }` for a known record; 400 invalid UUID, 404 unknown UUID, 503 database/service failure.
- All public status responses use `Cache-Control: no-store` and allow cross-origin GET requests without credentials.
- Authenticate every admin page and mutation; validate mutation inputs on the server; write an explicit target boolean rather than inverting database state.
- Credentials and database access stay server-only. Missing auth configuration denies admin access.
- Carebox contract: two-second startup timeout; only a successful JSON response with boolean `disabled === true` blocks rendering; all check failures allow normal rendering.
- Exact blocked message: `Nhớ trả hết phí nhé`. Do not modify the Carebox checkout in this plan.
- No polling, scheduling, expiry dates, payments integration, custom messages, record deletion, or customer telemetry.
- Run lint and TypeScript checks first. If either fails, stop verification and report the failure. Do not run a production build unless a concrete need arises or Anderson requests it.
- Never print or commit real secrets. Do not provision hosting, a production database, or DNS.

## Review Focus

1. Concurrent or repeated admin submissions must write the requested boolean without toggling back: Task 3.
2. Database outages must not leak connection details, cache a disabled result, or permit login without throttling: Tasks 1 and 2.
3. Missing configuration, malformed hashes, and tampered or expired cookies must deny authentication: Task 2.
4. Empty, overlong, or SQL-looking names and invalid boolean inputs must be handled at the trust boundary: Tasks 1 and 3.
5. Missing records and error responses must still carry CORS/no-store headers so customer startup can fail open: Tasks 1 and 4.

## File Map

- Root configuration: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `.oxlintrc.json`, `.gitignore`, `.env.example`, `vitest.config.ts`.
- `app/layout.tsx`, `app/globals.css`, `app/error.tsx`: application shell, accessible styling, and safe fallback UI.
- `lib/db.ts`: lazy shared PostgreSQL pool with bounded connection/query timeouts and a safe pool error handler.
- `lib/switches.ts`: record type, validation, parameterized queries.
- `app/api/status/[id]/route.ts`: public GET contract and response headers.
- `migrations/001_initial.sql`, `scripts/migrate.mjs`: initial schema and transactional, repeatable schema setup.
- `lib/credentials.ts`, `lib/auth.ts`, `lib/login-throttle.ts`: password/session primitives, Next.js cookie adapter, shared throttling.
- `scripts/hash-password.mjs`: terminal helper to produce an administrator password hash.
- `app/login/page.tsx`, `app/login/actions.ts`, `app/login/login-form.tsx`: login UI and server action.
- `app/page.tsx`, `app/actions.ts`, `app/switch-controls.tsx`: dashboard, authenticated mutations, pending/error feedback and URL copying.
- `tests/status.test.ts`, `tests/credentials.test.ts`, `tests/auth.test.ts`, `tests/actions.test.ts`: focused checks; optionally `tests/database.test.ts` for a dedicated test database.
- `README.md`: setup, deployment prerequisites, API contract, consumption example and known limits.

## Task 1: Database-backed public status endpoint

**Files:** Root configuration, `app/layout.tsx`, `app/globals.css`, `lib/db.ts`, `lib/switches.ts`, `migrations/001_initial.sql`, `scripts/migrate.mjs`, `app/api/status/[id]/route.ts`, `tests/status.test.ts`, optional `tests/database.test.ts`.

**Interfaces:**
- `type SwitchRecord = { id: string; name: string; disabled: boolean; updated_at: Date }` in `lib/switches.ts`.
- `isSwitchId(value: string): boolean`; `validateName(value: unknown): string` returns the trimmed name or throws a validation error.
- `getSwitchStatus(id: string): Promise<boolean | null>`; null means not found.
- `listSwitches(): Promise<SwitchRecord[]>`; sort newest update first, then ID for deterministic ties.
- `createSwitch(name: string): Promise<SwitchRecord>`; use `crypto.randomUUID()` and the database default false.
- `setSwitchDisabled(id: string, disabled: boolean): Promise<boolean>`; return whether a row exists, update `updated_at` on a state change, and reject invalid inputs.
- `getPool(): Pool` in `lib/db.ts`, initialized only when needed so a missing database does not fail module import.
- Public `GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response>`.

- [x] **Step 1: Create the minimum project configuration.** Verify currently supported stable package versions and Node engine requirements against the registry/documentation at execution time; record exact installed versions in the lockfile. Add scripts `dev`, `start`, `lint`, `typecheck`, `test`, `db:migrate`, and `hash-password`. Use `oxlint --deny-warnings`, `next typegen && tsc --noEmit`, and `vitest run`; type generation is not a production build. Initialize this directory as its own Git repository. Ignore environment files except `.env.example`, dependency/generated output, and local search indexes.
- [x] **Step 2: Write `tests/status.test.ts` against the interfaces above.** Mock database queries. Assert known true/false responses have only the `disabled` field; invalid UUID returns 400 without querying; missing record returns 404; rejected database query returns 503 without exposing the error. Assert every case has `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`, and no credentials header. Assert parameter arrays carry user input instead of interpolating SQL.
- [x] **Step 3: Run `npm run lint`, then `npm run typecheck`.** Stop on failure under Anderson's verification rule. Once both pass, run `npm test -- tests/status.test.ts`; confirm behavior failures precede the implementation. Keep imports/type declarations available so the intended red test is behavioral rather than a typecheck failure.
- [x] **Step 4: Implement the schema, queries and route.** `switches` has the exact columns from the spec, UUID primary key, false default, nonempty/length-constrained name, and timestamptz update field. Configure a small reusable pool with 1000 ms connection and query timeouts and sanitized error reporting. Use Node runtime for database routes and request-time reads. Apply the same response headers to all success/error branches; never fall back to an earlier status. Validate UUIDs before passing them to PostgreSQL.
- [x] **Step 5: Implement schema setup.** The first migration also creates the singleton login-throttle table specified in Task 2. The migration script loads local environment configuration using Next's environment loader, executes the checked-in migration transactionally, closes its pool, and exits nonzero on failure without printing credentials. Use idempotent initial table creation so running the initial setup twice is safe; do not build a migration framework.
- [x] **Step 6: Run lint, typecheck, then the focused status checks.** Expected: both static checks succeed and all status assertions pass. If `TEST_DATABASE_URL` is explicitly available, exercise initial migration twice, false default, parameterized insert/read/update, and missing row using a dedicated temporary schema; never run test cleanup against the normal `DATABASE_URL`. Otherwise record the database acceptance gap.
- [x] **Step 7: Review the task diff and commit only its files** with message `feat: add database-backed switch status API`. Exclude unrelated files and secrets.

## Task 2: Administrator authentication and shared throttling

**Files:** `lib/credentials.ts`, `lib/auth.ts`, `lib/login-throttle.ts`, `scripts/hash-password.mjs`, `app/login/page.tsx`, `app/login/actions.ts`, `app/login/login-form.tsx`, `tests/credentials.test.ts`, `tests/auth.test.ts`, `.env.example`.

**Interfaces:**
- `verifyPassword(password: string, storedHash: string): Promise<boolean>` in `lib/credentials.ts`.
- `signSession(now: number, secret: string, credentialFingerprint: string): string`; `verifySession(token: string, now: number, secret: string, credentialFingerprint: string): boolean`; times are epoch milliseconds. The auth adapter computes the fingerprint from the configured username/password hash.
- `isAdmin(): Promise<boolean>` and `requireAdmin(): Promise<void>` in `lib/auth.ts`; the latter throws on unauthorized access so callers cannot continue database writes.
- `consumeLoginAttempt(): Promise<boolean>` and `clearLoginAttempts(): Promise<void>` in `lib/login-throttle.ts`.
- `type FormState = { error?: string }`; `login(previous: FormState, formData: FormData): Promise<FormState>`; success redirects to `/`.
- `logout(): Promise<void>` clears the cookie and redirects to `/login` using an authenticated server action.

- [x] **Step 1: Write focused credential/auth tests.** Assert correct/incorrect passwords, malformed stored hash, excessively large password input, valid/tampered/expired/malformed session tokens, expiration exactly at eight hours, and rejection after the credential fingerprint changes. Missing/invalid configuration must deny access. Test that login never echoes the submitted password, stores no cookie for failure, and refuses login when the throttle database fails. Verify concurrent attempt reservations permit only five attempts per 15-minute window, using a dedicated test database when available; unit checks also assert the atomic query/result handling.
- [x] **Step 2: Run lint and typecheck first, then the two focused test files to establish behavioral failures.** Use `npm test -- tests/credentials.test.ts tests/auth.test.ts` after both static checks succeed. Supply only test credentials and mock Next cookie/redirect functions; do not use real credentials.
- [x] **Step 3: Implement password and session primitives using Node crypto.** Use asynchronous scrypt with fixed parameters `N=16384`, `r=8`, `p=1`, a 16-byte random salt and 64-byte derived key, stored as `scrypt$<salt hex>$<key hex>`. Validate that exact format and use constant-time comparisons of equal-length buffers. Sign an expiration timestamp with HMAC-SHA256 using a base64-encoded signing secret decoded to at least 32 bytes. Expire sessions after eight hours. Include a fingerprint of the configured administrator username/password hash in the signed payload so changing credentials invalidates prior cookies. Reject invalid/future-out-of-range expirations and limit token size before parsing.
- [x] **Step 4: Implement atomic database throttling.** `admin_login_throttle` contains one fixed row (`id = 1`), `attempts`, and `window_started_at`. Reserve each attempt atomically with an upsert that resets after 15 minutes and returns no row once five attempts are consumed. Correct login clears attempts. Refuse authentication when throttling storage is unavailable. Document the deliberate shared limit: an attacker can temporarily block administrator login, while existing sessions and public checks keep working. No client-supplied IP headers are trusted.
- [x] **Step 5: Implement the Next cookie adapter, login form/actions and password helper.** Server-only environment variables: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`. Cookie name `kill-switch-admin`; HttpOnly, SameSite=Strict, Path=/, eight-hour lifetime, Secure in production. Require valid configuration for both creation and verification. Use server actions with framework origin protection for login/logout and validate all submitted input. Login inputs have explicit labels/autocomplete, bounded length and pending/error state via `useActionState`. Hash helper reads the password through hidden terminal input, requires at least 12 characters, outputs only the intended hash, and restores terminal state on failure/interruption. No secrets are supplied as command-line arguments or added to the repository.
- [x] **Step 6: Run lint, typecheck, then focused credential/auth checks.** Expected: all pass. Record any untested live database concurrency/cookie behavior rather than claiming runtime acceptance from mocks.
- [x] **Step 7: Review and commit task-owned files** with message `feat: protect switch administration with admin sessions`.

## Task 3: Protected dashboard and explicit switch mutations

**Files:** `app/page.tsx`, `app/actions.ts`, `app/switch-controls.tsx`, `app/error.tsx`, `app/globals.css`, `tests/actions.test.ts`.

**Interfaces:**
- Consume `SwitchRecord`, `listSwitches`, `createSwitch`, `setSwitchDisabled`, `isAdmin`, `requireAdmin`, `logout`, and `FormState` from Tasks 1 and 2.
- `addSwitch(previous: FormState, formData: FormData): Promise<FormState>` in `app/actions.ts`.
- `updateSwitch(previous: FormState, formData: FormData): Promise<FormState>` accepts hidden `id` and `disabled` where the submitted value must be exactly `true` or `false`.
- `CreateSwitchForm()`; `SwitchControls({ id, disabled }: { id: string; disabled: boolean })` in `app/switch-controls.tsx`.

- [ ] **Step 1: Write `tests/actions.test.ts`.** Assert unauthorized create/update requests never reach database methods; whitespace-only and over-120-character names fail; padded names trim; SQL-looking text remains data; malformed UUID and booleans such as missing, `1`, or `yes` fail. Two identical requests to disable must both request `true`, not toggle state. Assert missing rows and database failures return safe errors and success triggers dashboard revalidation. Logout must clear its session cookie.
- [ ] **Step 2: Run lint/typecheck before the focused test command.** When both pass, run `npm test -- tests/actions.test.ts` and confirm behavioral failures.
- [ ] **Step 3: Implement authenticated mutations.** Authorize inside each action before database access, validate all inputs, call the shared Task 1 functions, and revalidate `/` only after successful writes. Return safe errors without masking unauthorized access as success or exposing database details. Keep redirect/revalidation control flow outside broad catches where framework exceptions could be swallowed.
- [ ] **Step 4: Implement the protected server-rendered dashboard.** Redirect anonymous users to `/login` before reading records. Show a create form, empty state, current records, explicit status text, last-update time, logout, and one toggle/copy action per row. Use request-time database reads. Produce the public URL using the browser's current origin inside the copy click handler and the stored UUID; no extra URL environment variable is needed. Await clipboard writes and display failures. Use `useActionState` for forms; no effect-driven derived state, unnecessary memoization, or `void` calls.
- [ ] **Step 5: Apply simple responsive CSS and safe error UI.** Use readable contrast, visible focus, labels, status announcements, disabled pending controls, and errors beside the relevant form. Database errors show a retry message without stack traces or credentials. The dashboard must display an updated boolean after a successful mutation.
- [ ] **Step 6: Run lint, typecheck, then focused action checks.** If a local database/browser is available, additionally inspect login redirect, add, disable, enable, copy URL, logout, narrow viewport, and keyboard access; do not treat mocked unit checks as proof of those browser behaviors. Do not run a build.
- [ ] **Step 7: Review and commit task-owned files** with message `feat: add switch management dashboard`.

## Task 4: Setup documentation and delivery verification

**Files:** `README.md`, `.env.example`; revise existing task files only for issues uncovered during final review.

**Interfaces:** Deliver the npm scripts from Task 1, authentication configuration from Task 2, public route contract, and the customer integration contract from the approved spec.

- [ ] **Step 1: Write the local setup procedure.** Explain installing the recorded Node/npm dependencies, supplying a reachable PostgreSQL database, setting server-only environment variables, running the password-hash helper, generating the signing secret locally, running `npm run db:migrate`, and starting `npm run dev`. Include placeholders only. Explain that real `.env` files stay ignored and the admin service must use HTTPS in production. Add pool sizing/SSL configuration guidance for the selected database without disabling certificate verification.
- [ ] **Step 2: Document public API usage and the Carebox integration example.** Use a placeholder service origin and deployment UUID. Show a two-second fetch abort, `cache: 'no-store'`, a check of `response.ok`, guarded JSON parsing, strict boolean `data?.disabled === true`, and a catch that returns false. The normal React tree mounts only after the result resolves; true renders exactly `Nhớ trả hết phí nhé`. Treat the example as documented integration, not an edit to Carebox. Explain failure/unknown-record behavior, next-reload activation, public UUIDs, source-removal/endpoint-blocking bypass, and shared login-throttle limits.
- [ ] **Step 3: Check documented integration behavior.** Add a small self-check alongside the example or a focused test that exercises true, false, string `true`, null/malformed JSON, non-2xx, network failure and timeout. Keep it independent of the existing Carebox checkout and avoid creating a reusable SDK just for this example.
- [ ] **Step 4: Run final lint and typecheck; if either fails, stop verification and report.** If both pass, run the focused tests once as `npm test`. Run optional dedicated database checks only when `TEST_DATABASE_URL` is supplied; do not discover or repurpose credentials from sibling projects. Do not repeat already-passing checks absent a code change or concrete concern. No production build.
- [ ] **Step 5: Review the complete diff against the spec and this plan.** Confirm no Carebox edits, no generated or real environment secrets staged, lockfile present, standalone Git root correct, protected actions authorize independently of pages, all public error branches retain CORS/no-store, and setup docs match actual commands. Report browser/database/deployment gaps plainly.
- [ ] **Step 6: Commit task-owned delivery files** with message `docs: document kill switch setup and client contract`. Do not push, publish, provision infrastructure, or claim a live deployment.

## Execution and Handoff

Plan status: Approved for Native execution; implementation underway.

Recommended execution: **Native**. These four tasks share a small set of database/auth interfaces; implementing them in this session keeps that context together. Use an independent final reviewer if agent tools are available, and report their absence otherwise.

After plan approval, execute sequentially in the specified directory using the selected execution method. Existing files in any checkout remain protected; no separate worktree is needed if this is a new clean standalone repository. Ask only for genuinely required missing inputs; local implementation and mocked checks do not depend on production credentials.

## Technical References

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js data security and server action authorization: https://nextjs.org/docs/app/guides/data-security
- Parameterized PostgreSQL queries: https://node-postgres.com/features/queries
- Node.js crypto primitives: https://nodejs.org/api/crypto.html
