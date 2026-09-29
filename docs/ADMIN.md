# Club administration

Open `/admin` on the website and enter the club password. Your browser receives a server-verified session cookie; no visitor account is needed. Use **Sign out** on shared devices.

## Fixtures and results

Choose a season, then open **Fixtures & results**. Add a fixture or edit a match to set its kickoff, round, score, individual scorers and shootout winner. Kickoff editing uses your browser's local time.

Leave scores blank for an upcoming fixture. A score can be saved before all the goalscorers are known; the public website marks that report as incomplete. Individual scorer totals must not exceed the match score. Shootout goals are never entered as match goals: select only the winning team to award the extra league point.

If someone else changes a result while your form is open, the save is rejected and your unsaved form remains on screen. Use **Reload latest** to inspect the current saved version, then reapply the correction. **Change history** can reverse a result correction only while that result is still the version produced by that correction.

## Teams, players and seasons

In **Teams & players**, choose the season and click a team to see its squad. Use **Edit team** to change its name, abbreviation, colour, photo or badge. Add players with their display names, positions and any names used in the group chat. Separate player aliases with commas.

A team with fixtures cannot move to another season. A player with recorded goals cannot move teams. Create a new player or team record for the new season instead.

**Seasons & rules** controls match-win, draw and shootout-win points. Changing a season's scoring rules immediately changes its calculated table. Existing demo/archive classifications cannot be changed.

## Website content and photographs

**Website & images** edits homepage copy, venue information, statistics, benefit cards, social links, gallery images, contact copy and privacy text. Upload a photograph or provide an HTTPS image URL, then select **Save website content**. Team/player photographs are saved with their own record.

Uploading a photograph stores the file; it does not change the public site until its form is saved. Removing an image from the gallery removes its reference from that gallery, not the uploaded file.

## Enquiries, exports and usage

**Enquiries** shows contact messages, email addresses and any submitted phone/league details. The app stores messages but does not send automatic emails. The email link opens your normal email client.

**Change history → Export club data** downloads the current club data as JSON. Store exports carefully because they include private contact enquiries.

**AI usage** displays the current month's spending and reservations against the £5 monthly AI allowance. At the limit, the match reporter stops making AI calls; the website and manual editing continue to work. This allowance excludes hosting/storage fees.

## Resetting the demonstration

**Overview → Reset demo** restores the fictional season's original squads and results and clears the demo conversation. This replaces any edits made to the fictional season. It preserves real seasons, enquiries, website content, uploaded files, change history and the AI usage allowance. A confirmation explains the operation before it runs.

Visitors have independent demo sessions and a Reset demo button in the drawer. That button clears only their own season, chat and activity log. The admin reset above affects the canonical fictional season used by standalone MCP integrations; it does not reset visitors’ private sessions. All sessions share the monthly AI budget.

When the reporter has a valid update, it announces the save and the phone flips to **Agent activity**. The website result and standings appear alongside it before the change is sent. The developer view shows actual MCP/AI calls, JSON summaries, HTTP response codes and measured milliseconds; changed website values glow gold. Use **Group chat** to flip back. Keep the demo open during a save: if its live view cannot load, the update is paused rather than written out of sight.
