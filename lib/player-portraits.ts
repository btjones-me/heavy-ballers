import type { Player } from './types';
// Stable identities: never map by display order, which changes with rankings.
const squads: Record<string, string[]> = {
  qpr: ['alfie','sam','ben','ollie','max','harry','dan','sam-r'],
  net: ['leo','jamie','jake','liam','luke','chris','nathan'],
  paris: ['alex','will','josh','matt','tom','rob','charlie'],
  borussia: ['henry','jack','adam','george','rory','isaac','finn'],
};
export function playerPortrait(player?: Pick<Player,'id'|'teamId'|'photo'>) {
  if (!player) return null;
  if (player.photo) return {src:player.photo,cell:null};
  const cell=squads[player.teamId]?.findIndex(id=>`${player.teamId}-${id}`===player.id) ?? -1;
  const offset:Record<string,number>={qpr:0,net:3,paris:5,borussia:2};
  return cell<0 ? null : {src:`/assets/players/${player.teamId}-portraits.png`,cell:(cell+(offset[player.teamId]??0))%8};
}
