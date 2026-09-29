# Heavy Ballers verification record

This record describes checks actually performed during the 29 September 2026 implementation session. Local browser checks used `http://127.0.0.1:3000`. Public deployment is checked separately after publication; a successful local check is not a claim of public deployment.

## Public website and browser checks

| Check | Observed result |
| --- | --- |
| Source comparison | Opened the original website in Chrome and compared screenshots with the recreated desktop homepage. Original hero photograph, two introductory paragraphs, badge and six-a-side wordmark, Oswald/Open Sans fonts, navy/gold identity and centered desktop branding are present. |
| Responsive homepage | Visually inspected desktop and phone layouts. Hero text, calls to action, community statistics and mobile navigation fit the page. |
| Fixtures | Inspected the white result/fixture cards and distinct upcoming/latest sections. A live score update moved the reported fixture into results; incomplete scorer and shootout indicators appeared while those facts were missing. |
| League tables | Inspected a phone-sized table, then scrolled horizontally to reveal goals, shootouts, points and form. Added an explicit sideways-scroll hint. Tables remain focusable and every statistic has a descriptive column label. |
| Teams | Inspected fictional squads on mobile and historical Saturday squads on desktop. Pitch formations and player labels render; invented squads use silhouettes and team colours. Historical team photography loads. |
| Saturday season selection | Confirmed the visible selector defaults to Saturday Season 3. Fixed ordering after the API returned seasons alphabetically rather than in the seed-file order. |
| Image references | Checked historical team/player image references against local files. Browser inspection of the historical team page reported no completed broken images. |
| Mobile navigation | Opened the mobile navigation, expanded Teams and followed the Tuesday league link to its squad page. |
| Keyboard navigation | Opened Teams with Enter, tabbed into its links, then pressed Escape. The disclosure closed and focus returned to its summary. Repeated on mobile: Escape closed the menu and returned focus to the menu button. |
| Heading structure | Browser inspection confirmed one `h1` on the homepage after changing the fixtures-section title to an `h2`. The skip link targets a focusable main region. |
| Contact form | Entered the fictional local test record `Frontend QA` / `frontend-qa@example.invalid`, selected consent and submitted. The page displayed the saved-enquiry confirmation. No outbound email was sent. |
| Polling and form state | Contact inputs remained intact while the public content refreshed following an administrator's concurrent venue edit. |
| Browser restoration | Reset the temporary responsive viewport override after testing. |

Small accessibility refinements also include a labelled league-control group, visible focus outlines, larger result-status labels, darker gold statistic labels on white, menu-control relationships and reduced-motion styles. This was a targeted visual/keyboard review, not a complete assistive-technology or WCAG certification audit.

## Live agent result observed in a separate browser

The initial real LLM → MCP → database flow completed locally before later adversarial testing. A separate Chrome page visibly showed:

- Queens Pork Rangers **4–2** NetSix and Chill in latest results.
- Both teams' played count increasing to seven.
- Fragmented scorer reports appearing in the scorer rankings.
- NetSix and Chill shown as the shootout winner.
- Missing-scorer and shootout-pending labels disappearing after the reports were complete.

That observation verifies a real shared-data update, rather than only an animation in the phone drawer. A subsequent live rerun retained the 4–2 score after “I think the score was 5–2” and did not add an unknown “Dave” scorer. Deterministic regression tests additionally force the previously observed bad model calls and prove they cannot reach an MCP write. A wrong player ID offered as shootout winner is returned to the model for repair; the final live readback confirms score 4–2, NetSix shootout winner, and league points 3/1.

## Static checks

- `npx tsc --noEmit --pretty false` passed after frontend integration and after the keyboard/heading changes.
- `npx eslint components/PublicSite.tsx` completed with no errors. It reports native-image optimisation warnings; original local image assets intentionally use native image elements.
- All 24 backend, browser-polling, MCP, agent, grounding, concurrency, authentication and budget tests passed. Full project TypeScript and application ESLint checks passed.
- An initial production Worker build passed. The release workflow rebuilds the final source state before publication.

## Data limitations and deliberate boundaries

- Tuesday Season 2 is visibly labelled fictional. All its player records, seed match results and scorer allocations are invented. Borussia Munching Gladbach is a temporary demo team name.
- The seed provides twelve rounds, two matches per round and six completed rounds. Round seven is the intended report demonstration; running tests changes the shared local match state.
- Historical imports contain three archive seasons, six team records, sixty player records and thirty-three fixture records. They are a capture of available public records, not a claim of a complete historical dataset.
- Historical shootout outcomes were unavailable. Some historical scorer records are incomplete or inconsistent with published scorelines. The interface labels archives and incomplete reports rather than inventing the missing facts; derived archive standings may therefore differ from the original site's historical table or bonus totals.
- No individual weight records are stored. The homepage's aggregate weight-loss statistic reproduces public source copy; it is not calculated from personal records.
- The chat demonstration uses invented conversation messages. Real WhatsApp sending, syncing and a hosted WhatsApp adapter are outside this version.
- Public visitors do not have accounts. Administration uses the requested shared password and server-side session protection; this is the agreed initial access model.
- Contact enquiries are stored for administrator review. There is no outbound mail integration.

## Public deployment acceptance

Published at https://heavy-ballers-demo.btjones-me.chatgpt.site on 29 September 2026. The production Worker build and native Sites deployment succeeded.

- Played the complete five-message demonstration in the public phone drawer. The real model called the HTTP MCP service and saved score 4–2, Queens scorers Alfie (2), Sam (1), Ben (1), NetSix scorers Leo (1), Jamie (1), and NetSix's shootout win.
- An independent Chrome browser saw automatic standings changes: Queens 14 → 17 points and NetSix 7 → 8, both on seven played. Reload retained the result. Final match readback confirmed league points 3/1.
- Public admin content editing persisted on readback and was restored. A contact enquiry was stored, and an authenticated R2 image upload downloaded with identical bytes. No email was sent.
- Unauthenticated admin state/export and `/api/mcp` requests returned 401. An authenticated HTTP MCP report read succeeded. Sites manages OAuth on `/mcp`; standalone adapters and the backend agent use the credential-protected `/api/mcp` alias.
- All 24 automated tests passed, including report grounding, duplicate messages, stale conflicts, budget bounds, failed calls, authentication and demo ownership/poll races. TypeScript and application lint checks passed without errors.
- After public acceptance, the admin reset restored round seven to unreported, emptied the fictional conversation and released its lease. Historical fixture records were compared before/after and were unchanged. The AI ledger was retained: September spend 21,130 micro-GBP (£0.02113), with no outstanding reservations at that point.

Local ignored `qa/` artifacts retain the public screenshot and concise result/admin/reset evidence. The public demo is ready to replay; later visitors may change its shared state.

## Developer readout and navigation update

- All 32 automated tests pass. New cases prove that the MCP write is withheld until the current owner acknowledges the painted live view, stale and non-owner acknowledgements fail, an unacknowledged view times out without changing the result, and developer traces preserve HTTP status, JSON-RPC error codes and measured durations without credentials.
- A real local browser run displayed the automatic chat-to-activity flip, the live result view and gold change highlights. Score, both teams' fragmented scorer reports and the shootout saved correctly, ending at Queens 4–2 NetSix, with three and one league points respectively. MCP traces displayed real HTTP 200 results and a 202 notification acknowledgement, with measured millisecond timings.
- Local Chrome navigation checks clicked Tuesday/Saturday Teams, Tuesday/Saturday Tables and Scores & fixtures. Each changed the URL and rendered the correct content. Outside click, mutually exclusive dropdowns and Escape dismissal passed. Mobile Tables → Saturday at 390×844 navigated correctly and closed the menu. Public links use native navigation to avoid the observed Vinext client-router interception issue.


## Presentation handover repair — 29 September 2026

- Serialized demo polling per owner to prevent delayed snapshots from cancelling the next write's flip/readiness timers; state and acknowledgement requests now have bounded timeouts.
- Repeated open events preserve the live baseline and cannot leave the drawer in a permanent loading state. Closing still clears readiness, and reopening waits for a newly painted baseline.
- Visibility changes recheck the pending acknowledgement and pause autoplay when the tab is hidden. The presentation gate allows 30 seconds; writes still require owner acknowledgement.
- Mobile handovers scroll the live result into view. Delayed between-message transitions cannot override a newer gate.
- All 35 automated tests and TypeScript checking pass, including slow overlapping refreshes, owner changes and polling recovery.
- Actual GPT-6 Luna mobile run saved all five scripted facts through HTTP MCP: 4–2, both teams' cumulative scorers, then NetSix's shootout point. Closing/reopening and submitting a correction also saved successfully. Public season data was not reset for these checks.


## Private visitor demos and reset — 29 September 2026

- All 38 automated tests and TypeScript checking pass. Actual HTTP demo routes are covered: independent sessions, identical message and operation identifiers, isolated MCP writes and activity, anonymous clean baseline, reset expiry fences, simultaneous fixture writes and the shared AI budget.
- A rejected rate-limited reset preserves the visitor’s current session. Reset does not clear global AI spending or modify historical data.
- Local real GPT-6 Luna → HTTP MCP → D1 verification used Chrome and the in-app browser: Chrome saved 4–2 while the in-app browser independently saved 3–1. Reset in Chrome cleared its result, chat and traces; the other browser retained 3–1, including after reload.
- The visitor controls now include Reset demo, with a fresh token and private fictional season for each reset. Old polling responses cannot replace the new owner or its league data.

## Live API report robustness — 30 September 2026

- 40 deterministic tests pass, including the observed mixed payload: historical unsaved scorers plus a current shootout result. The shootout is saved through HTTP MCP while the unsupported scorer group stays unchanged.
- The built production Worker ran in workerd against isolated local D1 storage and the real GPT-6 Luna Responses API. The final live smoke pass verified 13 message cases, actual MCP writes and public bootstrap readbacks. No LLM responses or MCP writes were mocked.
- The five UI script messages each saved their expected intermediate facts, ending Queens 4–2 NetSix, Alfie 2 / Sam K 1 / Ben 1, Leo 1 / Jamie 1, and match points 3/1. The UI and smoke runner import the same script.
- Ambiguous Sam and unknown Dave were left unsaved with specific questions. A subsequent shootout-only message saved normally. First-person brace, aliases, “Me and Jamie”, a 5–2 correction, duplicate delivery without another paid call, separate visitors and private reset passed.
- Save acknowledgements and the next missing question are generated from the persisted fixture; the final pass correctly asked for NetSix scorers after Queens scorers were complete.
- Both live validation passes shared one retained budget ledger: 76 Responses API calls, conservative accounted cost **$0.033921625**, below the **$0.20 total ceiling**. No allowance was reset between passes. The gateway reserves before dispatch and retains the full reservation on uncertain outcomes.
- Evidence: ignored `qa/live-smoke-report.json` and `qa/live-smoke-budget.json`. Run `npm run test:live` explicitly; it builds and runs the live suite, returning nonzero on any assertion failure. The HTTP presentation client tests the readiness handshake; this is not a browser pixel/animation test.

- Final review narrowed first-person subject matching. Deterministic regressions accept “Me and Jamie scored” but reject treating “Sam told me Alfie scored” as evidence that the sender scored.

## 30 September 2026 — real match-centre iframe

The demonstration now embeds `/match-centre?embed=1`, explicitly labelled “Live website · iframe”. The same match centre is available as a full page. A same-origin/window-checked postMessage handshake passes the private session credential in memory (never in a URL), then waits for the corresponding API snapshot to paint before acknowledging the pending write. Token rotation remounts the view and fences old requests. Expired credentials return 401 rather than silently displaying the anonymous seed.

Validation: 42 deterministic tests and TypeScript checks pass. Browser checks against the local application and real HTTP MCP/D1 path verified:
- Saved 4–2 score appeared in the iframe and Queens moved from 14 to 17 points.
- Fragmented scorer details and NetSix shootout win appeared; NetSix moved from 7 to 8 points.
- 26 changed values had the gold-highlight class immediately after the write.
- A separate browser tab remained on the untouched anonymous baseline.
- Iframe reload and same-tab full match-centre navigation retained the private saved match.
- Reset returned the iframe to the untouched fixture; expiring only the local test session produced a visible reconnect/error state and reset recovered it.
- A test presentation gate in the local session was acknowledged by the actual rendered iframe, before a subsequent MCP write.
- Mobile viewport checked at 390×844; iframe scrolls independently, with access to all table columns.

No paid AI calls were needed for these presentation checks. The prior live model smoke suite remains separate; these checks exercise the browser presentation layer that API-only tests do not cover. Screenshot: `qa/iframe-match-centre-desktop.png`.

## 30 September 2026 — expired demo no longer blanks public pages

Production Worker logs confirmed repeated `GET /api/bootstrap` HTTP 401 responses from fixtures, Tuesday tables and Saturday tables at 00:08–00:09 BST. Example request `82ff981e1c82cfa4419fe75502deab33`, 172ms, Worker outcome `ok`: an intentional credential rejection, not a crashed Worker. The preceding release made demo reads strict but did not give PublicSite a recovery path.

PublicSite now uses `/api/bootstrap/public`: valid private credentials still return that visitor's saved demo; an invalid/expired credential returns public league data plus `demoSessionExpired: true`, shown explicitly in a banner. `/api/bootstrap` remains strict for the embedded match centre. No credential is deleted and no saved result is reset automatically. API failures log only method/path/status/code/generated requestId, returned as JSON and `X-Request-ID`; credentials and message bodies are excluded from these application log records.

Checks: TypeScript passes, 43 tests pass, including active-session public readback and expired public/strict endpoint contrast. Browser reproduction expired only a disposable local session: all 24 Tuesday fixtures and both season options stayed available with a clear recovery notice. Screenshot: `qa/expired-demo-recovery.png`. No paid AI calls.

## 30 September 2026 — floating demo window

The demo is now a draggable non-modal window, with a sticky minimise control. Minimising leaves the controller and frame mounted, polling and scripted playback running; the side tray reports running/attention/restore state. The persistent site shell preserves the reporter across normal page links and Back/Forward. Only explicit Pause, Reset or Release controls stop playback. Closing/reloading the browser is outside this in-page persistence contract.

Checks: TypeScript and all 46 tests pass. Local browser checks verified page navigation beneath the open window, draft retention through navigation/Back/minimise/restore, title-bar dragging, desktop layout and 390×844 mobile layout. A pending local presentation gate was acknowledged while minimised after a scoped bootstrap read, then a real HTTP MCP write changed the private result to 4–2: the underlying fixtures page updated and the restored iframe showed the same result. Reset from the standalone match-centre page refreshed its token and baseline without leaving a stale error. Background reads use the short timeout, and playback generations fence obsolete paused/reset loops. No paid AI calls. Screenshot: `qa/floating-demo-window.png`.
