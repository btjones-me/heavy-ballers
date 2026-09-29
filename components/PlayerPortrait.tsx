import type { Player } from '../lib/types';
import { playerPortrait } from '../lib/player-portraits';
export default function PlayerPortrait({player,size=36}:{player?:Player;size?:number}) {
  const portrait=playerPortrait(player);
  return <span className="player-portrait" aria-hidden="true" style={{width:size,height:size,flexShrink:0,...(portrait?{backgroundImage:`url("${portrait.src}")`,backgroundSize:portrait.cell===null?'cover':'400% 200%',backgroundPosition:portrait.cell===null?'center':`${portrait.cell%4/3*100}% ${Math.floor(portrait.cell/4)*100}%`}:{})}}>{!portrait&&(player?.name.split(' ').map(n=>n[0]).slice(0,2).join('')||'?')}</span>;
}
