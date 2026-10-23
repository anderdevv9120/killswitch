# Kill Switch service

Date: 2026-10-23
Status: Approved by Anderson on 2026-10-23
Source directory: `C:\Users\AndersonHo\Desktop\mine\outsource\kill-switch`

## Purpose

Provide an independently hosted service Anderson controls to manage whether a delivered application shows its normal interface or a payment reminder. The customer application must continue normally when checking the service fails.

The service contains a simple Next.js admin UI, backend routes, and PostgreSQL storage in one repository. Customer application source code and deployments remain separate.

## Scope and defaults

- One administrator; no registration, customer accounts, or role management.
- One switch record per customer deployment. A project with one deployment needs one record.
- New records default to `disabled = false`.
- The administrator can create records, list records, toggle their state, and copy their public check URLs.
- The disabled message stays in the customer application's source: `Nhớ trả hết phí nhé`.
- No polling, scheduling, expiry dates, payments integration, custom messages, record deletion, or customer telemetry.

The per-deployment model is a proposed default because it supports both one customer per project and multiple customers using the same source without adding a separate project/customer hierarchy.

## Architecture

Use a single Next.js App Router application with TypeScript. Server-rendered pages display records; server-side mutations create records and update switches. A public route handler exposes each switch state. PostgreSQL is accessed through parameterized queries using the `pg` driver; no ORM is needed for one table.

Keep the admin service, database credentials, and administrator credentials in Anderson's deployment. Only the public status URL is placed in customer source code.

Alternative approaches considered:

- A static JSON file is smaller but does not provide the requested admin UI and database-backed management.
- A separate frontend and backend would add deployment and authentication boundaries without helping this service.

## Data model

Table: `switches`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID | Primary key, generated when creating a record |
| `name` | text | Required, trimmed, 1-120 characters; use a project/customer label |
| `disabled` | boolean | Required, defaults to false |
| `updated_at` | timestamptz | Required, updated on creation and state changes |

Use a SQL migration checked into the repository. Database connection settings are server-only environment variables. Provide `.env.example` with placeholders and ignore real environment files.

## Admin UI and authentication

Provide a login page and a dashboard. The dashboard has a create form and a list showing name, current enabled/disabled status, last update time, a toggle, and a copy-URL action. Disable submission while it is pending, and display mutation errors beside the relevant action.

Use one administrator identity configured through server-only environment variables, a password hash, and an expiring signed session cookie. Use established cryptographic primitives; never store a plaintext password in the database or expose credentials in client bundles. The cookie is HttpOnly, SameSite, and Secure in production. Missing auth configuration must deny admin access.

Require authentication for both page access and every mutation. Validate names, UUIDs, and boolean inputs on the server. State changes accept an explicit target boolean rather than inverting the stored value, so duplicate submissions do not reverse the user's intent. Use same-origin protection for mutations and bounded login attempt throttling suitable for the selected deployment before exposing the service publicly.

The admin dashboard must read current database state rather than a cached page. Basic keyboard access, form labels, visible focus, and readable status text are part of the UI.

## Public status API

`GET /api/status/{id}`

- Known UUID: HTTP 200 with exactly `{ "disabled": true }` or `{ "disabled": false }`.
- Unknown UUID: HTTP 404; consuming applications treat this as a failed check and continue normally.
- Invalid UUID: HTTP 400.
- Database/service failure: HTTP 503; do not return a cached disabled result.
- All responses use `Cache-Control: no-store` and allow cross-origin GET requests without credentials.
- No endpoint exposes the record list or customer/project labels publicly.

The UUID selects a record; it is not an administrator credential. No customer-side secret or authenticated public read is required.

## Carebox consumption contract

On each page load, before mounting the normal application, fetch the configured status URL with caching disabled and a two-second timeout. Show the normal application unless a successful response contains a JSON object whose `disabled` property is the boolean `true`.

Only that explicit true result renders `Nhớ trả hết phí nhé` as the entire application interface. False, non-2xx responses, invalid JSON, invalid response shape, timeouts, and network errors all render the application normally. Do not persist a previous disabled result. The normal application must not mount before the initial check finishes, to avoid flashing its interface or starting its data requests first.

This repository will document the integration contract. Editing the existing Carebox checkout is a separate implementation boundary and is not included in creating the management repository.

## Local setup and delivery

Provide setup instructions for dependencies, PostgreSQL connection, migration execution, administrator password hash generation, session signing secret, development startup, and a sample public status request. Do not generate or print production credentials. Use a lockfile and initialize a standalone Git repository when scaffolding is approved.

Actual hosting, production database provisioning, DNS, and credentials are not selected by this design. They remain deployment work; the application should run locally once the documented environment variables and a reachable PostgreSQL database are supplied.

## Validation

Run lint and TypeScript checks first. If either fails, stop verification and report the failure. Do not run a production build unless a concrete need arises or Anderson requests it.

Provide small focused checks for authentication rejection, tampered/expired sessions, public status true/false, unknown IDs, database failure, input validation, and unauthenticated mutations. Database-backed checks require a dedicated test database; report any unavailable runtime checks explicitly. No broad test framework or general feature-flag engine is needed.

## Known limits

Customers who receive the application source can remove its check. Blocking the status endpoint also bypasses this fail-open design. A switch change takes effect on the next page load, not in already-open sessions. The service is a remotely controlled reminder mechanism, not tamper-resistant payment enforcement.
