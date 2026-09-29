export type ScoringRules = { win: number; draw: number; shootout: number };
export type Season = { id: string; name: string; league: 'tuesday' | 'saturday'; demo: boolean; rules: ScoringRules };
export type Team = { id: string; seasonId: string; name: string; color: string; shortName: string; photo?: string; badge?: string };
export type Player = { id: string; teamId: string; name: string; aliases: string[]; photo?: string; position?: string };
export type Scorer = { playerId: string; goals: number };
export type Fixture = { id: string; seasonId: string; round: number; kickoff: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; homeScorers: Scorer[]; awayScorers: Scorer[]; shootoutWinnerId: string | null; version: number; sourceNote?: string };
export type Content = { heroTitle: string; heroIntro: string; heroMore: string; heroImage: string; instagram: string; youtube: string; gallery: string[]; venue: string; venueAddress: string; contactIntro: string; privacyText: string; benefits: { title: string; image: string; body: string }[]; stats: { label: string; value: string }[] };
export type Bootstrap = { seasons: Season[]; teams: Team[]; players: Player[]; fixtures: Fixture[]; content: Content; revision: number };
export type FixturePatch = Partial<Omit<Fixture, 'id' | 'version'>>;
export type Standing = { teamId: string; name: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; shootoutWins: number; points: number; form: string[] };
export type GoalRanking = { playerId: string; name: string; teamId: string; goals: number };
export class AppError extends Error { constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') { super(message); this.name = 'AppError'; } }
