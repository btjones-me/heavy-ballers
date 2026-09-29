import type { Bootstrap, Player, Standing, Team } from './types';
import { calculateStandings } from './league-model';
export type MatchCard = {
  kind:'match-card'; format:1; fixtureId:string; version:number; season:string; round:number;
  home:Team; away:Team; homeScore:number; awayScore:number; shootout:Team;
  homeScorers:(Player & {goals:number})[]; awayScorers:(Player & {goals:number})[];
  standings:Standing[]; shootoutPoints:number;
};
export function makeMatchCard(data:Bootstrap, fixtureId='demo-gw7-1'):MatchCard|null {
  const match=data.fixtures.find(f=>f.id===fixtureId);
  if(!match||match.homeScore===null||match.awayScore===null||!match.shootoutWinnerId)return null;
  const season=data.seasons.find(s=>s.id===match.seasonId);
  const home=data.teams.find(t=>t.id===match.homeTeamId),away=data.teams.find(t=>t.id===match.awayTeamId);
  const shootout=data.teams.find(t=>t.id===match.shootoutWinnerId);
  if(!season?.demo||!home||!away||!shootout||![home.id,away.id].includes(shootout.id))return null;
  for(const side of ['home','away'] as const) {
    if(match[`${side}Scorers`].reduce((sum,s)=>sum+s.goals,0)!==match[`${side}Score`])return null;
    if(match[`${side}Scorers`].some(s=>!data.players.some(p=>p.id===s.playerId&&p.teamId===match[`${side}TeamId`])))return null;
  }
  const scorers=(side:'home'|'away')=>match[`${side}Scorers`].map(s=>({...data.players.find(p=>p.id===s.playerId)!,goals:s.goals}));
  return {kind:'match-card',format:1,fixtureId:match.id,version:match.version,season:season.name,round:match.round,home,away,homeScore:match.homeScore,awayScore:match.awayScore,shootout,homeScorers:scorers('home'),awayScorers:scorers('away'),standings:calculateStandings(data.teams.filter(t=>t.seasonId===season.id),data.fixtures.filter(f=>f.seasonId===season.id),season.rules),shootoutPoints:season.rules.shootout};
}
