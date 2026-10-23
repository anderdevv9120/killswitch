# Kill Switch

A small Next.js admin console backed by Neon PostgreSQL. Create one switch per customer deployment, copy its status URL, and enable or disable it from the dashboard.

## Local setup

Requires Node.js 24+ and a Neon PostgreSQL database.

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run hash-password
```

The password helper accepts hidden terminal input, requires 12-1024 characters, and prints a salted scrypt hash. It does not save your password.

Edit the ignored `.env.local`. Keep an existing `DATABASE_URL`; this checkout already has the supplied Neon URL configured locally. Never commit the real file.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-ENDPOINT-pooler.REGION.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=scrypt\$YOUR_32_HEX_SALT\$YOUR_128_HEX_KEY
SESSION_SECRET=YOUR_BASE64_SECRET
```

Replace the password hash with the helper's output, **escaping each `$` as `\$`** in the environment file. Next.js expands unescaped dollar expressions, even in quoted values. For example, `scrypt$abc$def` must be written as `scrypt\$abc\$def`. The salt/key above are placeholders, not usable credentials.

Generate a signing secret locally and copy its output into `SESSION_SECRET`:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64'))"
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`, then sign in with your configured username and the password you entered in the helper. Missing or malformed administrator configuration denies login. Restart the server after changing environment settings.

`db:migrate` applies `migrations/001_initial.sql` transactionally and can be repeated. It creates the `switches` and `admin_login_throttle` tables without resetting their data. Later schema changes need a new migration; editing this initial file will not alter existing tables automatically.

## Using the dashboard

1. Add a deployment, such as `Carebox · Customer name`. It starts **Enabled** (`disabled: false`).
2. Copy its status URL into that deployment's application configuration.
3. Choose **Disable app** to return `disabled: true`, or **Enable app** to return false.

Switch changes take effect on the customer's next page load. Already-open sessions are not polled. There is one administrator and no registration or record deletion UI.

## Public API

```http
GET https://YOUR-SERVICE.example/api/status/DEPLOYMENT-UUID
```

Known records return HTTP 200 and exactly one boolean:

```json
{ "disabled": false }
```

Invalid UUID: 400. Unknown record: 404. Database failure: 503. Every handler response has `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`; public reads need no cookies or secret. Project/customer names and the record list stay private.

For a manual check:

```powershell
Invoke-RestMethod 'http://localhost:3000/api/status/REPLACE-WITH-YOUR-UUID'
```

## Customer application integration

Copy [examples/check-switch.mjs](examples/check-switch.mjs) into your React project. Its `shouldDisable(url)` function checks once with a two-second timeout and disabled caching. Only a successful JSON response with boolean `disabled === true` blocks the app. False, HTTP errors, malformed JSON, network errors, and timeouts all allow normal rendering. It does not persist a previous disabled result.

In the existing Carebox `src/main.tsx`, preserve the existing `Root` and wrap the final render like this. Adjust the example import to wherever you copied the file:

```tsx
import { shouldDisable } from './check-switch.mjs'

async function start() {
  const disabled = await shouldDisable('https://YOUR-SERVICE.example/api/status/YOUR-UUID')
  createRoot(document.getElementById('root')!).render(
    disabled
      ? <main lang="vi">Nhớ trả hết phí nhé</main>
      : <StrictMode><Root /></StrictMode>,
  )
}

start().catch((error) => {
  console.error('Application startup failed', error)
})
```

Replace the existing final `createRoot(...).render(...)` call so the normal app mounts only after the check resolves. Keep existing `createRoot` and `StrictMode` imports. This repository documents the integration; it does not edit Carebox.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
```

Run checks in that order and stop verification if lint or typecheck fails. Lint denies warnings. Typecheck generates Next.js route types without a production build. Focused tests cover real route/action/auth code with mocked database and Next.js request adapters, plus the client example's real timeout. They do not substitute for live database or browser acceptance.

## Deployment and limits

Host this service under your control with a Node.js runtime and HTTPS. Supply the four environment variables through the hosting provider's secret settings. In provider settings, use the raw scrypt hash with literal `$` characters; escaping is only for dotenv files. Run the schema migration against the chosen Neon database before serving traffic. Build and start using the normal Next.js deployment steps (`npm run build`, then `npm start`); builds are not part of routine verification here.

Use Neon's pooled endpoint for application traffic. The driver enables channel binding and the sample URL uses `sslmode=verify-full` to retain certificate and hostname checks. Do not disable certificate verification. Each server process uses at most five pool connections; account for the number of server instances when selecting database connection limits. Query/connection timeouts are one second for status traffic, so a cold or unavailable database can cause customer checks to fail open.

Admin sessions last eight hours. Changing the username, password hash, or signing secret invalidates earlier sessions. Login reservations are shared in PostgreSQL: five attempts in 15 minutes; successful login resets the count. An attacker can temporarily exhaust this shared limit and block new logins; existing sessions and public reads remain usable. Upgrade to a deployment-aware per-source limiter if that becomes a problem. Never trust arbitrary client IP headers without a trusted proxy configuration.

Receiving the application source lets a customer remove the check. Blocking the status endpoint also bypasses it, by design. This is a remotely controlled reminder mechanism, not tamper-resistant payment enforcement. Hosting, DNS and production deployment are separate setup work.

Rotate database credentials shared in chat before production use, then update `.env.local` and your hosting secrets. Never put the Neon URL in a client bundle or a `NEXT_PUBLIC_` variable.
