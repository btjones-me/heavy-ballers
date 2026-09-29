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
- All 19 backend, MCP, agent, grounding, concurrency, authentication and budget tests passed. Full project TypeScript and application ESLint checks passed.
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

## Final deployment and acceptance follow-up

Pending main-agent completion:

1. Record final ambiguity/correction, duplicate-message, conflict, budget-limit and API-failure test outcomes, including the clarification rerun.
2. Record the final automated test/build results.
3. Record the separate public URL and verify the deployed homepage, admin login, persistence, image upload and MCP authentication.
4. Demonstrate a deployed LLM → MCP update and verify it from an independent public page.
5. Restore the intended initial demo state after acceptance tests, without altering historical archive data.
