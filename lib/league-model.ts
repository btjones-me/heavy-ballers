import { AppError, type Bootstrap, type Fixture, type FixturePatch, type GoalRanking, type ScoringRules, type Standing, type Team, type Player } from './types';

export function calculateStandings(teams: Team[], fixtures: Fixture[], rules: ScoringRules = { win: 3, draw: 1, shootout: 1 }): Standing[] {
  const rows = new Map(teams.map(team => [team.id, { teamId: team.id, name: team.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, shootoutWins: 0, points: 0, form: [] as string[] }]));
  for (const fixture of [...fixtures].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))) {
    const home = rows.get(fixture.homeTeamId), away = rows.get(fixture.awayTeamId);
    if (!home || !away || fixture.homeScore === null || fixture.awayScore === null) continue;
    home.played++; away.played++;
    home.goalsFor += fixture.homeScore; home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore; away.goalsAgainst += fixture.homeScore;
    if (fixture.homeScore === fixture.awayScore) { home.drawn++; away.drawn++; home.points += rules.draw; away.points += rules.draw; home.form.push('D'); away.form.push('D'); }
    else { const [winner, loser] = fixture.homeScore > fixture.awayScore ? [home, away] : [away, home]; winner.won++; winner.points += rules.win; winner.form.push('W'); loser.lost++; loser.form.push('L'); }
    if (fixture.shootoutWinnerId === home.teamId) { home.shootoutWins++; home.points += rules.shootout; }
    if (fixture.shootoutWinnerId === away.teamId) { away.shootoutWins++; away.points += rules.shootout; }
  }
  return [...rows.values()].map(row => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst, form: row.form.slice(-5) })).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name));
}

export function calculateGoalscorers(players: Player[], fixtures: Fixture[]): GoalRanking[] {
  const rows = new Map(players.map(player => [player.id, { playerId: player.id, name: player.name, teamId: player.teamId, goals: 0 }]));
  for (const fixture of fixtures) {
    if (fixture.homeScore === null || fixture.awayScore === null) continue;
    for (const scorer of [...fixture.homeScorers, ...fixture.awayScorers]) { const row = rows.get(scorer.playerId); if (row) row.goals += scorer.goals; }
  }
  return [...rows.values()].filter(row => row.goals > 0).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

export function validateFixture(current: Fixture, patch: FixturePatch, state: Pick<Bootstrap, 'seasons' | 'teams' | 'players'>): Fixture {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new AppError('A match update must be an object.');
  const allowed = ['seasonId', 'round', 'kickoff', 'homeTeamId', 'awayTeamId', 'homeScore', 'awayScore', 'homeScorers', 'awayScorers', 'shootoutWinnerId', 'sourceNote'];
  for (const key of Object.keys(patch)) if (!allowed.includes(key)) throw new AppError(`Unsupported match field: ${key}`);
  const next = { ...current, ...patch, id: current.id, version: current.version + 1 };
  const season = state.seasons.find(s => s.id === next.seasonId);
  if (!season) throw new AppError('Unknown season.');
  if (next.homeTeamId === next.awayTeamId) throw new AppError('A team cannot play itself.');
  if (![next.homeTeamId, next.awayTeamId].every(id => state.teams.some(team => team.id === id && team.seasonId === next.seasonId))) throw new AppError('Both teams must belong to the match season.');
  if (!Number.isInteger(next.round) || next.round < 1 || next.round > 1000) throw new AppError('Round must be between 1 and 1000.');
  if (typeof next.kickoff !== 'string' || !Number.isFinite(Date.parse(next.kickoff))) throw new AppError('Enter a valid kickoff date.');
  for (const score of [next.homeScore, next.awayScore]) if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) throw new AppError('Scores must be whole numbers from 0 to 100.');
  if ((next.homeScore === null) !== (next.awayScore === null)) throw new AppError('Report both match scores together.');
  if (next.shootoutWinnerId !== null && ![next.homeTeamId, next.awayTeamId].includes(next.shootoutWinnerId)) throw new AppError('The shootout winner must be one of the two teams.');
  if (next.homeScore === null && next.shootoutWinnerId !== null) throw new AppError('Report the match score before the shootout result.');
  if (next.sourceNote !== undefined && (typeof next.sourceNote !== 'string' || next.sourceNote.length > 2000)) throw new AppError('Source note is too long.');
  const ids = new Set<string>();
  for (const side of ['home', 'away'] as const) {
    const scorers = next[`${side}Scorers`], score = next[`${side}Score`], teamId = next[`${side}TeamId`];
    if (!Array.isArray(scorers) || scorers.length > 100) throw new AppError('Goalscorers must be a list of at most 100 players.');
    let goals = 0;
    for (const scorer of scorers) {
      if (!scorer || typeof scorer !== 'object' || !state.players.some(player => player.id === scorer.playerId && player.teamId === teamId)) throw new AppError('Every goalscorer must belong to the relevant team.');
      if (ids.has(scorer.playerId)) throw new AppError('List each goalscorer once, with their total goals.');
      if (!Number.isInteger(scorer.goals) || scorer.goals < 1 || scorer.goals > 100) throw new AppError('Each scorer needs a positive whole number of goals.');
      ids.add(scorer.playerId); goals += scorer.goals;
    }
    if (score === null && goals > 0) throw new AppError('Report the match score before goalscorers.');
    const unchangedArchiveTotal = !season.demo && score === current[`${side}Score`] && JSON.stringify(scorers) === JSON.stringify(current[`${side}Scorers`]);
    if (score !== null && goals > score && !unchangedArchiveTotal) throw new AppError(`The ${side} scorers exceed the team's match score.`);
  }
  return next;
}
