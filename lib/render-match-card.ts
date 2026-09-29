import type { MatchCard } from './match-card';
import { playerPortrait } from './player-portraits';

const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image(); image.crossOrigin='anonymous';
  const timeout=setTimeout(()=>{image.src='';reject(new Error('A player portrait took too long to load.'));},10000);
  image.onload=()=>{clearTimeout(timeout);resolve(image)};
  image.onerror=()=>{clearTimeout(timeout);reject(new Error('A player portrait could not be loaded.'))};image.src=src;
});
// Render the immutable saved match-centre snapshot as a real, downloadable PNG.
export async function renderMatchCard(card:MatchCard):Promise<Blob> {
  const players=[...card.homeScorers,...card.awayScorers];
  const sources=[...new Set(players.map(p=>playerPortrait(p)?.src).filter((s):s is string=>!!s))];
  const images=new Map(await Promise.all(sources.map(async src=>[src,await loadImage(src)] as const)));
  const rows=Math.max(card.homeScorers.length,card.awayScorers.length,1),tableY=340+rows*96;
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=tableY+190+card.standings.length*66;
  const context=canvas.getContext('2d');if(!context)throw new Error('Image rendering is unavailable in this browser.');
  const c:CanvasRenderingContext2D=context;
  const bg=c.createLinearGradient(0,0,1080,canvas.height);bg.addColorStop(0,'#153962');bg.addColorStop(1,'#071a32');c.fillStyle=bg;c.fillRect(0,0,canvas.width,canvas.height);
  function text(value:string,x:number,y:number,size=24,color='#fff',weight=500,maxWidth?:number){c.fillStyle=color;c.font=`${weight} ${size}px Arial, sans-serif`;c.textAlign='left';if(maxWidth)c.fillText(value,x,y,maxWidth);else c.fillText(value,x,y)}
  text('KENSINGTON HEAVY BALLERS',48,56,22,'#e0b564',700);
  text(`MATCH CENTRE  /  ROUND ${card.round}`,48,96,16,'#bacbdd');
  text('FULL TIME',860,56,19,'#e0b564',700);
  c.fillStyle=card.home.color;c.fillRect(48,132,460,5);c.fillStyle=card.away.color;c.fillRect(572,132,460,5);
  text(card.home.name,48,178,27,'#fff',700,460);text(card.away.name,572,178,27,'#fff',700,460);
  c.textAlign='center';c.fillStyle='#e0b564';c.font='800 92px Arial';c.fillText(`${card.homeScore}  –  ${card.awayScore}`,540,278);
  text(`${card.shootout.name} won the shootout · +${card.shootoutPoints} point`,48,318,21,'#c7dbef',500,984);
  for(const [side,x] of [[card.homeScorers,48],[card.awayScorers,572]] as const){
    side.forEach((p,i)=>{
      const y=350+i*96,portrait=playerPortrait(p),image=portrait&&images.get(portrait.src);
      c.save();c.beginPath();c.arc(x+35,y+35,35,0,Math.PI*2);c.clip();
      if(image&&portrait){if(portrait.cell!==null){const w=image.width/4,h=image.height/2;c.drawImage(image,portrait.cell%4*w,Math.floor(portrait.cell/4)*h,w,h,x,y,70,70)}else c.drawImage(image,x,y,70,70)}
      else {c.fillStyle='#345570';c.fillRect(x,y,70,70)}c.restore();
      text(p.name,x+88,y+29,26,'#fff',700,280);text(`${p.goals} ${p.goals===1?'goal':'goals'}`,x+88,y+58,20,'#e0b564');
    });
    if(!side.length)text('Clean sheet for the opposition',x,390,19,'#c7dbef');
  }
  text('UPDATED LEAGUE TABLE',48,tableY+42,25,'#fff',700);
  const columns=[590,670,750,830,910,992];
  text('#',48,tableY+85,16,'#9fb7ce');text('TEAM',92,tableY+85,16,'#9fb7ce');
  ['P','GF','GA','GD','SO','PTS'].forEach((label,i)=>text(label,columns[i],tableY+85,16,'#9fb7ce',700));
  card.standings.forEach((row,i)=>{
    const y=tableY+104+i*66;c.fillStyle=[card.home.id,card.away.id].includes(row.teamId)?'#234865':'#142c46';c.fillRect(38,y,1004,60);
    text(String(i+1),48,y+39,23,'#a8bfd5');text(row.name,92,y+39,23,'#fff',600,465);
    [row.played,row.goalsFor,row.goalsAgainst,row.goalDifference,row.shootoutWins,row.points].forEach((v,j)=>text(String(v),columns[j],y+39,24,j===5?'#e0b564':'#fff',j===5?800:500));
  });
  text(`${card.season} · Saved report v${card.version}`,48,canvas.height-40,16,'#9fb7ce');
  text('Fictional players · AI-generated portraits',48,canvas.height-16,14,'#9fb7ce');
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The match image could not be created.')),'image/png'));
}
