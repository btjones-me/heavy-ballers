# Heavy Ballers

The public site and admin use React, TypeScript and Next.js App Router conventions, compiled by Vinext for a Cloudflare Worker on Sites. Data lives in D1; uploaded photographs live in R2. The application has no visitor accounts. The separate demo does not connect to or send messages through WhatsApp.

## Data and rules

`lib/league.ts` is the shared result-writing service used by the admin and MCP. It checks team/player relationships and scorer totals, requires an expected version, makes writes and audit records in one atomic batch, and records idempotency keys. Standings and goalscorer rankings are derived from results. A shootout win adds one league point; shootout goals are never part of goals for, goal difference or goalscorer totals. Match wins award three points and draws one. Each season stores its rules.

The fictional Tuesday Season 2 has four teams, 12 rounds and six completed rounds. Round seven's `demo-gw7-1` is Queens Pork Rangers vs NetSix and Chill. All fictional names and data are labelled. `lib/history.json` preserves publicly available historical Tuesday and Saturday fixtures. Source records with incomplete or inconsistent scorers are flagged, with no invented shootout bonuses. Historic rankings reflect the recorded data and may therefore be incomplete.

## Agent and transport

Browser → `/api/demo/message` → OpenAI Responses API → function tool selection → HTTP MCP `/mcp` → shared result service → D1. Before writes, deterministic checks require reported score evidence, explicit confirmation of score corrections, and unique named/aliased players. Ungrounded guesses trigger clarification. Tool schemas are discovered from the MCP server; tool calls actually cross its HTTP endpoint. The browser never receives the OpenAI key or MCP credential. Agent messages and tool activity are persisted. Public data refreshes every 2.5 seconds, including in other visitors' browsers.

`ChatEvent` in `lib/agent.ts` is the adapter boundary: conversationId, messageId, senderId, fixtureId, text and timestamp. A future WhatsApp adapter should authenticate webhook signatures, resolve senders to verified team identities, map conversations to fixtures, then feed these events into a hosted orchestration service using the same MCP tools. The current public demo maps four invented sender identities to the single demonstration fixture. It cannot write historical results.

One visitor owns a ten-minute renewable demo lease. Other visitors can read the shared conversation. A separate database mutex serializes agent requests and demo resets. Only admin can reset. Expired leases are reclaimable. Refreshing preserves the owning token in session storage. Pausing stops the scripted playback after any already running message finishes.

## Spend control

The monthly ledger uses integer millionths of GBP, with a cap of 5,000,000 (£5). Each message reserves £0.125 atomically before any provider call. A run allows at most six calls, each with at most 1,200 output tokens and a 24,000-byte complete request. The default GPT-5 mini rate is accounted at £0.50/million input tokens and £4/million output tokens, conservatively twice its numerical USD list price. Cached tokens get no discount in the ledger. Successful calls reconcile against reported token counts; uncertain failed calls consume the reservation. Crashed requests retain their reservation rather than making the budget available again. Demo reset never resets the usage ledger.

This limit covers this application's dedicated credential usage through this agent. Keep the key dedicated. Hosting/storage charges are separate. Changing model requires an explicit conservative cost profile: `OPENAI_INPUT_MICRO_GBP_PER_TOKEN` and `OPENAI_OUTPUT_MICRO_GBP_PER_TOKEN`. These values are microGBP per token (equivalently GBP per million tokens), and should include an exchange-rate/pricing margin. For non-default models the reservation grows to cover the same six-call byte/token bound; missing, invalid or unaffordable profiles fail closed. Pricing reference: https://developers.openai.com/api/docs/models/gpt-5-mini

## Authentication and persistence

Admin login checks the server-held password, throttles attempts and issues a hashed, HttpOnly, SameSite=Strict session cookie, Secure on HTTPS, expiring after 12 hours. Mutating browser endpoints require the same origin. Contact enquiries are stored for admin viewing and are not emailed. File uploads require admin, accept PNG/JPEG/WebP signatures only and have a 5 MB limit. Public assets are served with content-type protection. Secrets live in ignored local environment files and Sites secret storage, never the source manifest.

`APP_ORIGIN` is the fixed, server-held MCP origin, preventing a user-supplied Host header from choosing where the MCP credential is sent. The dedicated MCP token is separate from the admin password and does not grant admin access.

## Local development

Install with `npm run install:ci`; configure `.dev.vars` using `.env.example` and keep it ignored. Run `npm run dev -- --host 127.0.0.1 --port 3000`, and set `APP_ORIGIN=http://127.0.0.1:3000`. Run `npm run db:local` to apply generated Drizzle migrations to the local D1 binding before using the app. Run `node --test tests/backend.test.mjs` and `npx tsc --noEmit`.

Sites deployment uses `.openai/hosting.json`, a pushed source commit and the corresponding Worker archive. D1 migrations are packaged with deployment. Environment changes require redeployment. The original kensingtonheavyballers.co.uk site is not changed by this project.
