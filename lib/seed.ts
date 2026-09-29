import { all, db } from './db';
import type { Bootstrap, Content, Fixture, Player, Season, Team } from './types';
import history from './history.json';

export const DEMO_SEASON_ID = 'tuesday-demo-s2';
export const DEMO_FIXTURE_ID = 'demo-gw7-1';
export const demoSeason: Season = { id: DEMO_SEASON_ID, name: 'Season 2 · Demo', league: 'tuesday', demo: true, rules: { win: 3, draw: 1, shootout: 1 } };
export const demoTeams: Team[] = [
  { id: 'qpr', seasonId: DEMO_SEASON_ID, name: 'Queens Pork Rangers', color: '#267ee8', shortName: 'QPR' },
  { id: 'paris', seasonId: DEMO_SEASON_ID, name: 'Paris St Chowmein', color: '#24282e', shortName: 'PSC' },
  { id: 'net', seasonId: DEMO_SEASON_ID, name: 'NetSix and Chill', color: '#e23c42', shortName: 'NET' },
  { id: 'borussia', seasonId: DEMO_SEASON_ID, name: 'Borussia Munching Gladbach', color: '#ebbd36', shortName: 'BMG' },
];
const roster: Record<string, [string, string, string[]][]> = {
  qpr: [['alfie', 'Alfie H', ['Alfie']], ['sam', 'Sam K', ['Sam']], ['ben', 'Ben J', ['Ben']], ['ollie', 'Ollie D', ['Ollie']], ['max', 'Max T', ['Max']], ['harry', 'Harry W', ['Harry']], ['dan', 'Dan P', ['Dan']]],
  paris: [['alex', 'Alex C', ['Alex']], ['will', 'Will S', ['Will']], ['josh', 'Josh F', ['Josh']], ['matt', 'Matt L', ['Matt']], ['tom', 'Tom E', ['Tom']], ['rob', 'Rob V', ['Rob']], ['charlie', 'Charlie B', ['Charlie']]],
  net: [['leo', 'Leo M', ['Leo']], ['jamie', 'Jamie R', ['Jamie']], ['jake', 'Jake A', ['Jake']], ['liam', 'Liam O', ['Liam']], ['luke', 'Luke N', ['Luke']], ['chris', 'Chris G', ['Chris']], ['nathan', 'Nathan I', ['Nathan']]],
  borussia: [['henry', 'Henry Q', ['Henry']], ['jack', 'Jack U', ['Jack']], ['adam', 'Adam X', ['Adam']], ['george', 'George Y', ['George']], ['rory', 'Rory Z', ['Rory']], ['isaac', 'Isaac V', ['Isaac']], ['finn', 'Finn E', ['Finn']]],
};
export const demoPlayers: Player[] = Object.entries(roster).flatMap(([teamId, people]) => people.map(([id, name, aliases], i) => ({ id: `${teamId}-${id}`, teamId, name, aliases, position: i === 6 ? 'Goalkeeper' : i < 2 ? 'Forward' : i < 4 ? 'Midfielder' : 'Defender' })));
demoPlayers.push({ id: 'qpr-sam-r', teamId: 'qpr', name: 'Sam R', aliases: ['Sam R'], position: 'Forward' });

export function makeDemoFixtures(): Fixture[] {
  const pairings = [[['qpr', 'net'], ['paris', 'borussia']], [['qpr', 'paris'], ['net', 'borussia']], [['qpr', 'borussia'], ['paris', 'net']]];
  const scores = [[3, 2], [1, 1], [2, 4], [3, 0], [5, 2], [2, 2], [1, 3], [2, 1], [4, 1], [2, 3], [2, 2], [1, 4]];
  return Array.from({ length: 12 }, (_, index) => index + 1).flatMap(round => pairings[(round - 1) % 3].map(([a, b], matchIndex) => {
    const reverse = round <= 6 && round > 3 || round > 9;
    const [homeTeamId, awayTeamId] = reverse ? [b, a] : [a, b];
    const completed = round <= 6;
    const score = scores[(round - 1) * 2 + matchIndex];
    // Requested fictional-season leader: Sam R has eight goals across four games.
    const allocation = (teamId: string, goals: number) => goals === 0 ? [] : [{ playerId: teamId === 'qpr' && [1, 3, 4, 6].includes(round) ? 'qpr-sam-r' : `${teamId}-${roster[teamId][(round + matchIndex) % 5][0]}`, goals: Math.ceil(goals / 2) }, ...(goals > 1 ? [{ playerId: `${teamId}-${roster[teamId][(round + matchIndex + 1) % 5][0]}`, goals: Math.floor(goals / 2) }] : [])];
    const date = new Date(Date.UTC(2026, 7, 18 + (round - 1) * 7, 18, matchIndex * 30));
    return { id: `demo-gw${round}-${matchIndex + 1}`, seasonId: DEMO_SEASON_ID, round, kickoff: date.toISOString(), homeTeamId, awayTeamId, homeScore: completed ? score[0] : null, awayScore: completed ? score[1] : null, homeScorers: completed ? allocation(homeTeamId, score[0]) : [], awayScorers: completed ? allocation(awayTeamId, score[1]) : [], shootoutWinnerId: completed ? (round % 2 ? homeTeamId : awayTeamId) : null, version: 0, sourceNote: 'Fictional demonstration season. All player records and match data are invented.' };
  }));
}
export const defaultContent: Content = {
  heroTitle: 'KENSINGTON HEAVY BALLERS!',
  heroIntro: "Kensington Heavy Ballers isn't just about the scoreline; it’s about a healthier headline for your life. We are a 6-a-side football league specifically designed for men who want to shed some kilos, lace up their boots, and get fit without the judgment of a traditional gym.",
  heroMore: "Whether you haven't kicked a ball in a decade or you're just looking for a supportive community that shares your fitness goals, this is your squad. No egos, no elitism—just real men putting in the work, dropping sizes, and having a laugh while doing it.",
  heroImage: '/assets/heavy-ballers-hero.png', instagram: 'https://www.instagram.com/kensingtonheavyballers/', youtube: '',
  gallery: ['3C9A7700.webp','3C9A7701.webp','3C9A7721.webp','3C9A7783.webp','IMG-20260627-WA0021.webp','IMG-20260627-WA0023.webp','PXL_20260711_100827464.webp','PXL_20260711_100923272.webp'].map(name => `/assets/${name}`),
  venue: 'Kensington Leisure Centre', venueAddress: 'Silchester Road, London W10 6EX',
  contactIntro: "We're currently looking for new players so if you want to get involved please reach out to us by completing the form below with your details.",
  privacyText: 'This independent demonstration stores contact details only so the administrator can respond to your enquiry. Demo chat messages are processed by OpenAI to update a fictional league and are visible to other visitors. Please do not enter private or sensitive information. No individual weight records are stored. Contact the administrator to request deletion of your enquiry.',
  benefits: [{ title: 'WEIGHT LOSS', image: '/assets/weight-lose-icon.png', body: 'Make a positive change, one game at a time. Get moving, build healthy habits and celebrate progress together.' }, { title: 'BROTHERHOOD', image: '/assets/brotherhood-icon.png', body: 'Good football. Great people. Be part of a supportive team that has your back, on and off the pitch.' }, { title: 'ALL ABILITIES', image: '/assets/all-abilities-icon.png', body: 'A warm welcome, whatever your experience. Lace up your boots, find your team and enjoy the game.' }],
  stats: [{ label: 'TEAMS', value: '4' }, { label: 'PLAYERS', value: '40+' }, { label: 'WEIGHT LOST', value: '250KG+' }],
};
export function seedData(): Bootstrap {
  return { seasons: [demoSeason, ...history.seasons as Season[]], teams: [...demoTeams, ...history.teams as Team[]], players: [...demoPlayers, ...history.players as Player[]], fixtures: [...makeDemoFixtures(), ...history.fixtures as Fixture[]], content: defaultContent, revision: 1 };
}
let seeding: Promise<void> | undefined;
export async function ensureSeed(): Promise<void> {
  if (seeding) return seeding;
  seeding = (async () => {
    const exists = await all<{ key: string }>('SELECT key FROM kv WHERE key = ?', 'seed-version');
    if (exists.length) return;
    const value = seedData();
    const database = db();
    const statements = [
      ...value.seasons.map(item => database.prepare('INSERT OR IGNORE INTO seasons(id,data) VALUES(?,?)').bind(item.id, JSON.stringify(item))),
      ...value.teams.map(item => database.prepare('INSERT OR IGNORE INTO teams(id,season_id,data) VALUES(?,?,?)').bind(item.id, item.seasonId, JSON.stringify(item))),
      ...value.players.map(item => database.prepare('INSERT OR IGNORE INTO players(id,team_id,data) VALUES(?,?,?)').bind(item.id, item.teamId, JSON.stringify(item))),
      ...value.fixtures.map(item => database.prepare('INSERT OR IGNORE INTO fixtures(id,season_id,home_team_id,away_team_id,version,data) VALUES(?,?,?,?,?,?)').bind(item.id, item.seasonId, item.homeTeamId, item.awayTeamId, item.version, JSON.stringify(item))),
      database.prepare('INSERT OR IGNORE INTO kv(key,value) VALUES(?,?)').bind('content', JSON.stringify(value.content)),
      database.prepare('INSERT OR IGNORE INTO kv(key,value) VALUES(?,?)').bind('revision', '1'),
      database.prepare('INSERT OR IGNORE INTO kv(key,value) VALUES(?,?)').bind('seed-version', '1'),
    ];
    await database.batch(statements);
  })();
  try { await seeding; } catch (error) { seeding = undefined; throw error; }
}
