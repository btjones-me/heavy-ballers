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
  for (const player of players) for (const alias of [player.name, ...player.aliases, player.name.split(' ')[0]]) {
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
  const sharedSubject = players.some(player => [player.name, ...player.aliases].some(name => new RegExp(`(?:^|[.!?;])\\s*me\\s+and\\s+${escape(normalize(name))}\\s+(?:both\\s+)?(?:scored|got|bagged|netted)\\b`, 'u').test(normalize(current.text))));
  if ((/\bi\s+(?:scored|got|bagged|netted)\b/i.test(current.text) || sharedSubject) && self.length === 1) explicit.add(self[0].id);
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

/** Resolve only exact roster names/aliases and their ID-shaped spelling; never fuzzy-match. */
export function prepareReportPatch(report: ReportContext, proposed: FixturePatch, current: UserEvidence, previous: UserEvidence[] = []) {
  const patch: FixturePatch = {}, rejected: {field: string; code: string; message: string}[] = [];
  const canonicalId = (value: string, squad: Player[]) => {
    if (squad.some(p => p.id === value)) return value;
    const key = normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
    const candidates = squad.filter(p => [p.name, ...p.aliases, `${p.teamId} ${p.name}`].some(name => normalize(name).replace(/[^a-z0-9]+/g, ' ').trim() === key));
    return candidates.length === 1 ? candidates[0].id : value;
  };
  const accept = (field: string, candidate: FixturePatch) => {
    const decision = guardMatchReport(report, candidate, current, previous);
    if (decision.ok) Object.assign(patch, candidate);
    else rejected.push({field, code: decision.code, message: decision.message});
  };
  if ((proposed.homeScore !== undefined && proposed.homeScore !== report.fixture.homeScore) || (proposed.awayScore !== undefined && proposed.awayScore !== report.fixture.awayScore)) {
    accept('score', {homeScore: proposed.homeScore !== undefined ? proposed.homeScore : report.fixture.homeScore, awayScore: proposed.awayScore !== undefined ? proposed.awayScore : report.fixture.awayScore});
  }
  for (const side of ['home', 'away'] as const) {
    const field = `${side}Scorers` as const, values = proposed[field];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.some(v => !v || typeof v.playerId !== 'string' || !Number.isInteger(v.goals) || v.goals < 1)) {
      rejected.push({field,code:'INVALID_SCORERS',message:'Please give the goalscorer’s name and how many they scored.'}); continue;
    }
    const squad = report[`${side}Squad`], saved = report.fixture[field];
    const normalized = values.map(v => ({playerId:canonicalId(v.playerId,squad),goals:v.goals}));
    // Treat partial lists as additions unless the user explicitly corrects/removes a scorer.
    const merged = new Map((correction(current.text) ? [] : saved).map(v => [v.playerId,v]));
    for (const scorer of normalized) merged.set(scorer.playerId,scorer);
    const next = [...merged.values()];
    if (next.length === saved.length && next.every(v => saved.some(s => s.playerId === v.playerId && s.goals === v.goals))) continue;
    const unknown = next.find(v => !squad.some(p => p.id === v.playerId));
    if (unknown) { rejected.push({field,code:'UNKNOWN_PLAYER_ID',message:`Use a player from ${report[`${side}Team`].name}: ${squad.map(p=>p.name).join(', ')}. If the reported name is ambiguous, ask which player.`}); continue; }
    accept(field,{[field]:next});
  }
  if (proposed.shootoutWinnerId !== undefined && proposed.shootoutWinnerId !== report.fixture.shootoutWinnerId) accept('shootoutWinnerId',{shootoutWinnerId:proposed.shootoutWinnerId});
  return {patch,rejected};
}

/** A saved-result acknowledgement is factual UI copy, not another inference task. */
export function savedReportReply(before: ReportContext, after: ReportContext): string {
  const a=before.fixture,b=after.fixture,home=after.homeTeam.name,away=after.awayTeam.name;
  const pieces:string[]=[];
  if(a.homeScore!==b.homeScore||a.awayScore!==b.awayScore)pieces.push(`Saved: ${home} ${b.homeScore}–${b.awayScore} ${away}.`);
  for(const side of ['home','away'] as const){
    const changed=b[`${side}Scorers`].filter(s=>!a[`${side}Scorers`].some(old=>old.playerId===s.playerId&&old.goals===s.goals));
    if(changed.length)pieces.push(`Recorded ${changed.map(s=>`${after[`${side}Squad`].find(p=>p.id===s.playerId)?.name??'player'} (${s.goals})`).join(', ')}.`);
  }
  if(a.shootoutWinnerId!==b.shootoutWinnerId)pieces.push(b.shootoutWinnerId?`${b.shootoutWinnerId===b.homeTeamId?home:away} won the shootout — bonus point added.`:'The shootout result has been cleared.');
  if(!pieces.length)pieces.push('The confirmed details are saved.');
  if(b.homeScore===null||b.awayScore===null)pieces.push('What was the final match score?');
  else if(b.homeScorers.reduce((n,s)=>n+s.goals,0)<b.homeScore)pieces.push(`Who scored the remaining goals for ${home}?`);
  else if(b.awayScorers.reduce((n,s)=>n+s.goals,0)<b.awayScore)pieces.push(`Who scored the remaining goals for ${away}?`);
  else if(!b.shootoutWinnerId)pieces.push('Who won the penalty shootout?');
  else pieces.push('All match details are complete.');
  return pieces.join(' ');
}
