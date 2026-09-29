# Heavy Ballers

The public site and admin use React, TypeScript and Next.js App Router conventions, compiled by Vinext for a Cloudflare Worker on Sites. Data lives in D1; uploaded photographs live in R2. The application has no visitor accounts. The separate demo does not connect to or send messages through WhatsApp.

## Data and rules

`lib/league.ts` is the shared result-writing service used by the admin and MCP. It checks team/player relationships and scorer totals, requires an expected version, makes writes and audit records in one atomic batch, and records idempotency keys. Standings and goalscorer rankings are derived from results. A shootout win adds one league point; shootout goals are never part of goals for, goal difference or goalscorer totals. Match wins award three points and draws one. Each season stores its rules.

The fictional Tuesday Season 2 has four teams, 12 rounds and six completed rounds. Round seven's `demo-gw7-1` is Queens Pork Rangers vs NetSix and Chill. All fictional names and data are labelled. `lib/history.json` preserves publicly available historical Tuesday and Saturday fixtures. Source records with incomplete or inconsistent scorers are flagged, with no invented shootout bonuses. Historic rankings reflect the recorded data and may therefore be incomplete.

## Agent and transport

Browser → `/api/demo/message` → OpenAI Responses API → function tool selection → HTTP MCP `/api/mcp` → shared result service → D1. Before writes, deterministic checks require reported score evidence, explicit confirmation of score corrections, and unique named/aliased players. Ungrounded guesses trigger clarification. Tool schemas are discovered from the MCP server; tool calls actually cross its HTTP endpoint. The browser never receives the OpenAI key or MCP credential. Agent messages and tool activity are persisted. League data refreshes every 2.5 seconds using the current visitor’s private demo overlay. Other visitors cannot see these changes.

`ChatEvent` in `lib/agent.ts` is the adapter boundary: conversationId, messageId, senderId, fixtureId, text and timestamp. A future WhatsApp adapter should authenticate webhook signatures, resolve senders to verified team identities, map conversations to fixtures, then feed these events into a hosted orchestration service using the same MCP tools. The current public demo maps four invented sender identities to the single demonstration fixture. It cannot write historical results.

Each browser tab has an independent 24-hour D1 demo snapshot, identified by a hashed opaque bearer token kept in session storage. Messages, traces, idempotency records, presentation gates and per-session agent locks are scoped to this identity. Visitors can run demos simultaneously. Reset demo rotates the token and expires the old snapshot, fencing delayed writes without affecting other visitors. The same league validation service is used, with optimistic whole-snapshot version checks to prevent lost updates. Session creation limits run before rotation so a refused reset preserves the existing session. Pausing stops playback after the current message finishes. The £5 monthly budget remains global, including across resets.

The demo records real MCP and AI request traces: request summaries, HTTP status, response payloads and elapsed milliseconds. Credentials and internal reasoning are excluded. Running and completed trace entries share an ID so the developer readout shows each call once. The phone flips to this readout before a write, alongside a live view of the result, standings and scorers. That view polls the same private league overlay every 750 ms and highlights changed values.

After validating a proposed update, the agent announces it and creates an expiring presentation gate. Only the current demo owner can acknowledge `/api/demo/present`, after the browser has painted the live baseline and completed the flip. The MCP write waits for that acknowledgement; an unacknowledged gate times out after 30 seconds without sending the write. Client refreshes are single-flight per owner, with bounded network timeouts, so late snapshots cannot cancel the handover. Visibility changes recheck readiness; autoplay pauses while the tab is hidden. Reopening the already-open drawer preserves its painted baseline. On mobile each handover scrolls the live result into view. This presentation handshake belongs to the browser demonstration; standalone MCP clients do not need it.

## Spend control

The monthly ledger uses integer millionths of GBP, with a cap of 5,000,000 (£5). Each message reserves £0.125 atomically before any provider call. A run allows at most six calls, each with at most 1,200 output tokens and a 24,000-byte complete request. The default GPT-6 Luna model uses low reasoning effort on the standard service tier. Usage is accounted at £0.25/million input tokens and £1/million output tokens, conservatively twice the numerical USD cache-write and output prices (including a margin above ordinary input pricing). Cached tokens get no discount in the ledger. Successful calls reconcile against reported token counts; uncertain failed calls consume the reservation. Crashed requests retain their reservation rather than making the budget available again. Demo reset never resets the usage ledger.

This limit covers this application's dedicated credential usage through this agent. Keep the key dedicated. Hosting/storage charges are separate. Changing model requires an explicit conservative cost profile: `OPENAI_INPUT_MICRO_GBP_PER_TOKEN` and `OPENAI_OUTPUT_MICRO_GBP_PER_TOKEN`. These values are microGBP per token (equivalently GBP per million tokens), and should include an exchange-rate/pricing margin. For non-default models the reservation grows to cover the same six-call byte/token bound; missing, invalid or unaffordable profiles fail closed. Pricing reference: https://developers.openai.com/api/docs/models/gpt-6-luna

## Authentication and persistence

Admin login checks the server-held password, throttles attempts and issues a hashed, HttpOnly, SameSite=Strict session cookie, Secure on HTTPS, expiring after 12 hours. Mutating browser endpoints require the same origin. Contact enquiries are stored for admin viewing and are not emailed. File uploads require admin, accept PNG/JPEG/WebP signatures only and have a 5 MB limit. Public assets are served with content-type protection. Secrets live in ignored local environment files and Sites secret storage, never the source manifest.

`APP_ORIGIN` is the fixed, server-held MCP origin, preventing a user-supplied Host header from choosing where the MCP credential is sent. The dedicated MCP token is separate from the admin password and does not grant admin access. Sites reserves `/mcp` for its managed OAuth plugin connection; the backend calls the same protocol handler at `/api/mcp` using the separate token. Trusted platform identity is accepted only at `/mcp`, never as authorization for the service alias.

## Local development

Install with `npm run install:ci`; configure `.dev.vars` using `.env.example` and keep it ignored. Run `npm run dev -- --host 127.0.0.1 --port 3000`, and set `APP_ORIGIN=http://127.0.0.1:3000`. Run `npm run db:local` to apply generated Drizzle migrations to the local D1 binding before using the app. Run `npm test` and `npx tsc --noEmit`.

Sites deployment uses `.openai/hosting.json`, a pushed source commit and the corresponding Worker archive. D1 migrations are packaged with deployment. Environment changes require redeployment. The original kensingtonheavyballers.co.uk site is not changed by this project.
