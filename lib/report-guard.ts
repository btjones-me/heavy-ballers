import type { Fixture, FixturePatch, Player, Team } from './types';

export type ReportContext = { fixture: Fixture; homeTeam: Team; awayTeam: Team; homeSquad: Player[]; awaySquad: Player[] };
export type UserEvidence = { text: string; senderName: string; teamId: string };
export type GuardDecision = { ok: true } | { ok: false; message: string; code: string };
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentions(text: string, name: string) { return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(normalize(name))}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalize(text)); }
function correction(text: string) {
  return !/\b(i think|maybe|perhaps|possibly|not sure|unsure|might|could have)\b/i.test(text) && /\b(correction|corrected|correct (?:score|result)|actually|change (?:it|that|the score|the result)|yes[,.!\s]+(?:please[,.!\s]+)?(?:change|correct|update))\b/i.test(text);
}
function namedPlayers(text: string, players: Player[]): Set<string> {
  const names = new Map<string, Set<string>>();
  for (const player of players) for (const alias of [player.name, ...player.aliases]) {
    const key = normalize(alias.trim()); if (!key) continue;
    const ids = names.get(key) ?? new Set<string>(); ids.add(player.id); names.set(key, ids);
  }
  const found = new Set<string>();
  for (const [name, ids] of names) if (ids.size === 1 && mentions(text, name)) found.add([...ids][0]);
  return found;
}
function scorePairs(text: string): [number, number][] {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  let normalized = text.toLowerCase();
  for (const [number, word] of words.entries()) normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), String(number));
  return [...normalized.matchAll(/\b(\d{1,2})\s*(?:[-–—:]|\bto\b)\s*(\d{1,2})\b/g)].map(match => [Number(match[1]), Number(match[2])]);
}

/** Reject ungrounded writes even when the model confidently proposes them. */
export function guardMatchReport(report: ReportContext, patch: FixturePatch, current: UserEvidence, previous: UserEvidence[] = []): GuardDecision {
  const fixture = report.fixture;
  const scoreChanged = (patch.homeScore !== undefined && patch.homeScore !== fixture.homeScore) || (patch.awayScore !== undefined && patch.awayScore !== fixture.awayScore);
  if (scoreChanged) {
    const home = patch.homeScore ?? fixture.homeScore, away = patch.awayScore ?? fixture.awayScore;
    if (fixture.homeScore !== null && fixture.awayScore !== null && !correction(current.text)) return { ok: false, code: 'SCORE_CONFIRMATION', message: `I have ${fixture.homeScore}–${fixture.awayScore} saved. Is ${home ?? '?'}–${away ?? '?'} a correction? Please say “correct score” to confirm.` };
    const evidence = scorePairs(current.text).length ? [current] : previous.slice(-1);
    if (patch.homeScore === null || patch.awayScore === null || !evidence.some(fragment => scorePairs(fragment.text).some(([a, b]) => (a === home && b === away) || (a === away && b === home)))) return { ok: false, code: 'SCORE_NOT_GROUNDED', message: 'What was the final match score? Please give both teams’ scores.' };
    const reported = evidence.at(-1);
    if (reported && home !== null && away !== null) {
      const ownScore = reported.teamId === fixture.homeTeamId ? home : away;
      const otherScore = reported.teamId === fixture.homeTeamId ? away : home;
      const won = /\bwe\s+(?:won|beat)\b/i.test(reported.text), lost = /\bwe\s+lost\b/i.test(reported.text), drew = /\bwe\s+(?:drew|draw)\b/i.test(reported.text);
      if ((won && ownScore <= otherScore) || (lost && ownScore >= otherScore) || (drew && ownScore !== otherScore)) return { ok: false, code: 'SCORE_TEAM_MISMATCH', message: 'Please confirm the score for each team so I put the result the right way round.' };
    }
  }
  const players = [...report.homeSquad, ...report.awaySquad];
  const explicit = namedPlayers(current.text, players);
  const self = players.filter(player => player.teamId === current.teamId && normalize(player.name) === normalize(current.senderName));
  if (/\bi\s+(?:scored|got|bagged|netted)\b/i.test(current.text) && self.length === 1) explicit.add(self[0].id);
  // A immediately preceding user fragment can supply the name for “he got two”.
  // Assistant messages are never accepted as identity evidence.
  if (/\b(he|his|they|their|both|each|that|those)\b/i.test(current.text) && !explicit.size) {
    const prior = previous.at(-1); if (prior) for (const id of namedPlayers(prior.text, players)) explicit.add(id);
  }
  for (const side of ['home', 'away'] as const) {
    const scorers = patch[`${side}Scorers`]; if (!scorers) continue;
    for (const scorer of scorers) {
      const prior = fixture[`${side}Scorers`].find(item => item.playerId === scorer.playerId);
      if (prior?.goals === scorer.goals) continue;
      if (!explicit.has(scorer.playerId)) return { ok: false, code: 'SCORER_NOT_GROUNDED', message: 'I can’t match that scorer to the squad. Which listed player do you mean? Please use their name.' };
    }
    for (const removed of fixture[`${side}Scorers`].filter(item => !scorers.some(scorer => scorer.playerId === item.playerId))) {
      if (!correction(current.text) || !explicit.has(removed.playerId)) return { ok: false, code: 'SCORER_REMOVAL_CONFIRMATION', message: 'Some saved goalscorers would be removed. Please name the player and confirm the correction.' };
    }
  }
  if (patch.shootoutWinnerId !== undefined && patch.shootoutWinnerId !== fixture.shootoutWinnerId) {
    const shootoutText = /\b(shootout|penalt(?:y|ies)|pens)\b/i.test(current.text);
    if (patch.shootoutWinnerId === null) {
      if (!shootoutText || !correction(current.text)) return { ok: false, code: 'SHOOTOUT_CONFIRMATION', message: 'Should I remove the saved shootout result? Please confirm that correction.' };
    } else {
      const teams = [report.homeTeam, report.awayTeam];
      const winner = teams.find(team => team.id === patch.shootoutWinnerId);
      const names = winner ? [winner.name, winner.shortName, winner.name.split(' ')[0]].filter(name => name.length > 2 && teams.filter(team => [team.name, team.shortName, team.name.split(' ')[0]].some(alias => normalize(alias) === normalize(name))).length === 1) : [];
      const winningWords = /\b(won|wins?|winner|took|went to|point for)\b/i.test(current.text);
      const explicitlyNamed = names.some(name => mentions(current.text, name));
      const selfWon = current.teamId === patch.shootoutWinnerId && /\bwe\s+(?:won|win|took)\b/i.test(current.text);
      if (!shootoutText || !winningWords || (!explicitlyNamed && !selfWon) || /\b(lost|didn['’]?t win|did not win|not sure|maybe|i think)\b/i.test(current.text)) return { ok: false, code: 'SHOOTOUT_NOT_GROUNDED', message: 'Which team won the penalty shootout? Please name the team.' };
    }
  }
  return { ok: true };
}
