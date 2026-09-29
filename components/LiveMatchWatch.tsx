'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, RefreshCw, Trophy } from 'lucide-react';
import { calculateGoalscorers, calculateStandings } from '../lib/league-model';
import type { Bootstrap, Fixture } from '../lib/types';
import './live-watch.css';

export type LiveMatchWatchProps = { onReady: () => void; phase?: string };
const MATCH_ID = 'demo-gw7-1';
const GLOW_MS = 4200;

function viewOf(data: Bootstrap) {
  const match = data.fixtures.find(fixture => fixture.id === MATCH_ID);
  const season = data.seasons.find(item => item.id === match?.seasonId && item.demo);
  if (!match || !season) throw new Error('The demonstration fixture is unavailable. Ask the administrator to check the demo season.');
  const teams = data.teams.filter(team => team.seasonId === season.id);
  const fixtures = data.fixtures.filter(fixture => fixture.seasonId === season.id);
  const players = data.players.filter(player => teams.some(team => team.id === player.teamId));
  return { match, season, teams, players, standings: calculateStandings(teams, fixtures, season.rules), rankings: calculateGoalscorers(players, fixtures) };
}

function signatures(data: Bootstrap): Record<string, string> {
  const view = viewOf(data);
  const values: Record<string, string> = {
    'score-home': String(view.match.homeScore), 'score-away': String(view.match.awayScore),
    shootout: String(view.match.shootoutWinnerId),
  };
  for (const side of ['home', 'away'] as const) {
    for (const scorer of view.match[`${side}Scorers`]) values[`scorer-${scorer.playerId}`] = String(scorer.goals);
    values[`reported-${side}`] = String(view.match[`${side}Scorers`].reduce((sum, scorer) => sum + scorer.goals, 0));
  }
  for (const row of view.standings) {
    for (const statistic of ['played', 'goalsFor', 'goalsAgainst', 'goalDifference', 'shootoutWins', 'points'] as const) values[`${row.teamId}-${statistic}`] = String(row[statistic]);
  }
  for (const row of view.rankings) values[`ranking-${row.playerId}`] = String(row.goals);
  return values;
}

export default function LiveMatchWatch({ onReady, phase }: LiveMatchWatchProps) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [lastUpdate, setLastUpdate] = useState('Waiting for the first live snapshot');
  const prior = useRef<Record<string, string> | null>(null);
  const ready = useRef(false);
  const readyCallback = useRef(onReady);
  useEffect(() => { readyCallback.current = onReady; }, [onReady]);

  useEffect(() => {
    let active = true;
    let fetching = false;
    let controller: AbortController | undefined;
    const update = async () => {
      if (fetching) return;
      fetching = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch('/api/bootstrap', { headers: { 'x-demo-token': sessionStorage.getItem('heavy-ballers-demo-token') || '' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Live website refresh failed (HTTP ${response.status}).`);
        const next = await response.json() as Bootstrap;
        const values = signatures(next);
        if (!active) return;
        const previous = prior.current;
        const changed = previous ? Object.keys(values).filter(key => values[key] !== previous[key]) : [];
        const now = Date.now();
        setHighlights(current => {
          const retained = Object.fromEntries(Object.entries(current).filter(([, timestamp]) => now - timestamp < GLOW_MS));
          for (const key of changed) retained[key] = now;
          return retained;
        });
        if (changed.length) setLastUpdate('Saved changes received from the website');
        else if (!previous) setLastUpdate('Live baseline loaded · waiting for changes');
        prior.current = values;
        setData(next);
        setError('');
      } catch (problem) {
        if (active) setError(`${(problem as Error).name === 'AbortError' ? 'The live website refresh timed out.' : (problem as Error).message} ${prior.current ? 'Showing the last saved snapshot.' : 'The update demonstration is waiting for the website to load.'} Retrying automatically.`);
      } finally { clearTimeout(timeout); fetching = false; }
    };
    void update();
    const interval = setInterval(() => { void update(); }, 750);
    return () => { active = false; clearInterval(interval); controller?.abort(); };
  }, [retry]);

  // The parent may release a pending write only once the baseline has painted.
  useEffect(() => {
    if (!data || error || ready.current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { ready.current = true; readyCallback.current(); });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [data, error]);

  const value = useCallback((id: string, content: React.ReactNode) => <span key={`${id}-${highlights[id] || 'baseline'}`} className={`hb-live-value${highlights[id] ? ' hb-live-changed' : ''}`}>{content}</span>, [highlights]);
  const view = data ? viewOf(data) : null;
  const teamName = (id: string | null) => view?.teams.find(team => team.id === id)?.name || 'Pending';
  const playerName = (id: string) => view?.players.find(player => player.id === id)?.name || 'Unknown player';
  const scorers = (match: Fixture, side: 'home' | 'away') => {
    const entries = match[`${side}Scorers`];
    const reported = entries.reduce((sum, scorer) => sum + scorer.goals, 0);
    const score = match[`${side}Score`];
    return <div className="hb-live-scorers"><h4>{teamName(match[`${side}TeamId`])}</h4>{entries.length ? <ul>{entries.map(scorer => <li key={scorer.playerId}><span>{playerName(scorer.playerId)}</span>{value(`scorer-${scorer.playerId}`, scorer.goals)}</li>)}</ul> : <p>{score === 0 ? 'No goals' : 'Awaiting scorers'}</p>}<small>{value(`reported-${side}`, reported)}{score === null ? ' goals reported' : ` / ${score} goals confirmed`}</small></div>;
  };

  return <section className="hb-live-watch" aria-labelledby="hb-live-heading">
    <header className="hb-live-header"><div><p className="hb-live-eyebrow">Kensington Heavy Ballers · live website</p><h2 id="hb-live-heading">Watch the website update</h2></div><span className={`hb-live-connection${error ? ' is-stale' : ''}`}><Radio size={13}/>{error ? 'Reconnecting' : data ? 'Live' : 'Connecting'}</span></header>
    <p className="hb-live-explainer">The match, league table and goalscorers below read the saved website data. Gold highlights mark values that change.</p>
    {error && <div className="hb-live-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(current => current + 1)}><RefreshCw size={13}/> Retry now</button></div>}
    {!view ? <div className="hb-live-loading" role="status"><RefreshCw size={20}/> Loading the live result and league table…</div> : <>
      <article className="hb-live-match"><div className="hb-live-match-meta"><span>Tuesday · {view.season.name} · Round {view.match.round}</span><span>{view.match.homeScore === null ? 'Awaiting result' : 'Result saved'}</span></div>
        <div className="hb-live-scoreline"><h3>{teamName(view.match.homeTeamId)}</h3><div className="hb-live-score" aria-label={`Score: ${view.match.homeScore ?? 'pending'} to ${view.match.awayScore ?? 'pending'}`}>{value('score-home', view.match.homeScore ?? '–')}<span className="hb-live-score-divider">:</span>{value('score-away', view.match.awayScore ?? '–')}</div><h3>{teamName(view.match.awayTeamId)}</h3></div>
        <div className="hb-live-shootout"><Trophy size={14}/><span>Shootout · {value('shootout', view.match.shootoutWinnerId ? `${teamName(view.match.shootoutWinnerId)} +${view.season.rules.shootout} point` : 'Awaiting winner')}</span></div>
        <div className="hb-live-scorer-grid">{scorers(view.match, 'home')}{scorers(view.match, 'away')}</div>
      </article>
      <div className="hb-live-section-title"><h3>League standings</h3><span>Derived from saved results</span></div>
      <div className="hb-live-table-wrap" tabIndex={0} role="region" aria-label="Live league standings, scroll horizontally for every statistic"><table className="hb-live-table"><thead><tr><th scope="col">#</th><th scope="col">Team</th>{[['played', 'P', 'Played'], ['goalsFor', 'GF', 'Goals for'], ['goalsAgainst', 'GA', 'Goals against'], ['goalDifference', 'GD', 'Goal difference'], ['shootoutWins', 'SO', 'Shootout wins'], ['points', 'PTS', 'Points']].map(([key, label, title]) => <th scope="col" key={key}><abbr title={title}>{label}</abbr></th>)}</tr></thead><tbody>{view.standings.map((row, index) => <tr key={row.teamId} className={[view.match.homeTeamId, view.match.awayTeamId].includes(row.teamId) ? 'hb-live-featured-team' : ''}><td>{index + 1}</td><th scope="row"><i style={{ background: view.teams.find(team => team.id === row.teamId)?.color }}/>{row.name}</th>{(['played', 'goalsFor', 'goalsAgainst', 'goalDifference', 'shootoutWins', 'points'] as const).map(statistic => <td key={statistic} className={statistic === 'points' ? 'hb-live-points' : ''}>{value(`${row.teamId}-${statistic}`, row[statistic])}</td>)}</tr>)}</tbody></table></div>
      <p className="hb-live-rules">Win {view.season.rules.win} · Draw {view.season.rules.draw} · Shootout +{view.season.rules.shootout}. Shootout goals stay out of match scores and scorer totals.</p>
      <details className="hb-live-rankings"><summary>Season goalscorers <span>{view.rankings.length} players</span></summary><ul>{view.rankings.map(row => <li key={row.playerId}><span>{row.name}<small>{teamName(row.teamId)}</small></span>{value(`ranking-${row.playerId}`, row.goals)}</li>)}</ul></details>
      <footer className="hb-live-footer"><span className="hb-live-update-dot"/><span role="status">{lastUpdate}</span>{phase && <span className="hb-live-phase">{phase}</span>}</footer>
    </>}
  </section>;
}
