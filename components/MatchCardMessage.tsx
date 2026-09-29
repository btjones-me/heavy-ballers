'use client';
import {useEffect,useState} from 'react';
import type {MatchCard} from '../lib/match-card';
import {renderMatchCard} from '../lib/render-match-card';
export default function MatchCardMessage({snapshot,onReady}:{snapshot:string;onReady?:()=>void}) {
  const [url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  let card:MatchCard|null=null;try{card=JSON.parse(snapshot)}catch{}
  const description=card?`${card.home.name} ${card.homeScore}–${card.awayScore} ${card.away.name}. ${[...card.homeScorers,...card.awayScorers].map(p=>`${p.name} ${p.goals}`).join(', ')}. ${card.shootout.name} won the shootout. Updated table: ${card.standings.map((r,i)=>`${i+1}. ${r.name} ${r.points} points`).join('; ')}`:'Match summary';
  useEffect(()=>{
    let active=true,objectUrl='';setError('');setUrl('');
    void (async()=>{try{const data=JSON.parse(snapshot) as MatchCard;const blob=await renderMatchCard(data);if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}catch(e){if(active)setError((e as Error).message)}})();
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[snapshot,attempt]);
  return <div className="hb-match-card-message">{url?<><a href={url} target="_blank" rel="noreferrer" aria-label="Open full-size match summary image"><img src={url} alt={description} onLoad={onReady}/></a><a className="hb-match-card-download" href={url} download={`heavy-ballers-round-${card?.round}-v${card?.version}.png`}>Download match image ↓</a></>:error?<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry image</button></p>:<p role="status">Creating your match image…</p>}<p>All sorted ⚽ Here’s the result, scorers and updated league table.</p></div>;
}
