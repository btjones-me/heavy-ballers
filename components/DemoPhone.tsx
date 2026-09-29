'use client';
import { DEMO_SCRIPT as SCRIPT } from '../lib/demo-script';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Phone, Video, MoreVertical, Send, Play, Pause, LockKeyhole, ChevronDown, CheckCheck, Bot, Smile, Paperclip, AlertCircle, Radio, LoaderCircle, RotateCcw } from 'lucide-react';
import './demo.css';
import LiveMatchWatch from './LiveMatchWatch';
import TraceReadout, { type DemoEvent } from './TraceReadout';

type Message = { id: string; sender: string; text: string; role: string; createdAt: string };
type MatchSnapshot = { homeName: string; awayName: string; homeScore: number | null; awayScore: number | null; shootoutWinnerName: string | null; homePoints: number | null; awayPoints: number | null };
type DemoState = { presentation?: { runId: string; expiresAt: number } | null; match?: MatchSnapshot | null; messages: Message[]; events: DemoEvent[]; active: boolean; owner: boolean; busy: boolean; configured: boolean };
const EMPTY: DemoState = { messages: [], events: [], active: false, owner: false, busy: false, configured: true };
const TOKEN_KEY = 'heavy-ballers-demo-token';
const PROGRESS_KEY = 'heavy-ballers-demo-progress';
const PENDING_KEY = 'heavy-ballers-demo-pending';
const STEP_ID_KEY = 'heavy-ballers-demo-message-ids';
const senders = [{ id: 'ben', label: 'Ben J', team: 'Queens', color: '#7eccad' }, { id: 'alfie', label: 'Alfie H', team: 'Queens', color: '#b2a0e9' }, { id: 'sam', label: 'Sam K', team: 'Queens', color: '#ecac8b' }, { id: 'leo', label: 'Leo M', team: 'NetSix', color: '#75bee2' }];

const normalizedText = (value: string) => value.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const progressFrom = (messages: Message[]) => { let count = 0; for (const step of SCRIPT) { if (messages.some(m => normalizedText(m.text) === normalizedText(step.text))) count++; else break; } return count; };
function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
export async function demoRequest(path: string, body?: unknown, requestToken = token()) {
  const action = path.endsWith('/message') ? 'process your message' : path.endsWith('/start') ? 'start the demo' : path.endsWith('/release') ? 'release the controls' : 'refresh the conversation';
  const recovery = body !== undefined ? 'Some details may already be saved. Check the conversation and saved result before trying again.' : 'The displayed conversation may be out of date. Reopen the drawer to reconnect.';
  let response: Response;
  try {
    response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(path.endsWith('/state') || path.endsWith('/present') ? 8000 : 180000), headers: { 'x-demo-token': requestToken, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  } catch {
    throw new Error(`Could not ${action}: the connection to the website was interrupted. Check your internet connection. ${recovery}`);
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid response');
    data = parsed as Record<string, unknown>;
  } catch {
    const reason = [504, 524].includes(response.status) ? 'the server took too long to respond' : 'the website returned an unreadable response';
    throw new Error(`Could not ${action}: ${reason} (HTTP ${response.status}). ${recovery}`);
  }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : (data.error as { message?: string } | null)?.message;
    const fallback = response.status === 429 ? 'Too many requests. Wait a minute and try again.' : response.status === 401 || response.status === 403 ? 'The request was refused. Reopen the demo and try again; if it persists, ask the site admin to check access.' : 'The website could not complete this request. Try again shortly; if it persists, contact the site admin.';
    const code = typeof data.code === 'string' && /^[A-Z_]{1,50}$/.test(data.code) ? ` · ${data.code}` : '';
    throw new Error(`Could not ${action}: ${message || fallback} ${recovery} (HTTP ${response.status}${code})`);
  }
  return data;
}

// A poll started before control was acquired must not overwrite the new owner.
export async function refreshWithCurrentToken<T>(getToken: () => string, fetchState: (requestToken: string) => Promise<T>, getCurrent: () => T, publish: (value: T) => void): Promise<T> {
  const requestToken = getToken();
  let next: T;
  try { next = await fetchState(requestToken); }
  catch (error) { if (requestToken !== getToken()) return getCurrent(); throw error; }
  if (requestToken !== getToken()) return getCurrent();
  publish(next);
  return next;
}

// Share in-flight polls for the same owner: a slow pre-gate snapshot must never
// arrive after a newer snapshot and cancel that update's animation.
export function createDemoRefresh<T>(getToken: () => string, fetchState: (requestToken: string) => Promise<T>, getCurrent: () => T, publish: (value: T) => void) {
  let pending: { token: string; promise: Promise<T> } | undefined;
  return () => {
    const requestToken = getToken();
    if (pending?.token === requestToken) return pending.promise;
    const promise = refreshWithCurrentToken(getToken, fetchState, getCurrent, publish);
    const entry = { token: requestToken, promise };
    pending = entry;
    void promise.finally(() => { if (pending === entry) pending = undefined; }).catch(() => {});
    return promise;
  };
}

function normalize(raw: Record<string, unknown>): DemoState { const state = (raw.state || raw) as Partial<DemoState>; return { ...EMPTY, ...state, messages: state.messages || [], events: [...(state.events || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }; }
function senderInfo(sender: string) { return senders.find(s => s.id === sender || s.label.toLowerCase() === sender.toLowerCase()); }
function isAgent(message: Message) { return ['assistant', 'agent', 'system'].includes(message.role) || /reporter|agent|ballers bot|match bot/i.test(message.sender); }

export default function DemoPhone() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DemoState>(EMPTY);
  const stateRef = useRef<DemoState>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => () => { playingRef.current = false; }, []);
  const [message, setMessage] = useState('');
  const [sender, setSender] = useState('ben');
  const [showLog, setShowLog] = useState(false);
  const [side, setSide] = useState<'chat' | 'trace'>('chat');
  const [watchVisible, setWatchVisible] = useState(false);
  const [watchReady, setWatchReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [presentationReady, setPresentationReady] = useState('');
  const presentationAcks = useRef(new Set<string>());
  const presentationInFlight = useRef(new Set<string>());
  const onWatchReady = useCallback(() => setWatchReady(true), []);
  const onWatchUnavailable = useCallback(() => setWatchReady(false), []);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const drawer = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const publishState = useCallback((next: DemoState) => { stateRef.current = next; setState(next); sessionStorage.setItem(PROGRESS_KEY, String(progressFrom(next.messages))); const pending = sessionStorage.getItem(PENDING_KEY); setPendingIndex(pending === null ? null : Number(pending)); }, []);
  const refreshRef = useRef<ReturnType<typeof createDemoRefresh<DemoState>> | null>(null);
  if (!refreshRef.current) refreshRef.current = createDemoRefresh(token, async requestToken => normalize(await demoRequest('/api/demo/state', undefined, requestToken)), () => stateRef.current, publishState);
  const refresh = refreshRef.current;
  const show = useCallback(() => { window.dispatchEvent(new CustomEvent('hb-drawer-open', { detail: 'demo' })); setOpen(true); }, []);
  useEffect(() => { window.addEventListener('open-demo', show); return () => window.removeEventListener('open-demo', show); }, [show]);
  useEffect(() => { const otherDrawer = (event: Event) => { if ((event as CustomEvent).detail === 'architecture') { playingRef.current = false; setPlaying(false); setOpen(false); } }; window.addEventListener('hb-drawer-open', otherDrawer); return () => window.removeEventListener('hb-drawer-open', otherDrawer); }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void Promise.resolve().then(refresh).catch(e => { if (!cancelled) setError((e as Error).message); }).finally(() => { if (!cancelled) setLoading(false); });
    const interval = setInterval(() => { void refresh().catch(() => {}); }, 750);
    return () => { cancelled = true; clearInterval(interval); };
  }, [open, refresh]);
  useEffect(() => { if (!open) setWatchReady(false); }, [open]);
  useEffect(() => {
    const visible = () => {
      const isVisible = document.visibilityState !== 'hidden';
      setPageVisible(isVisible);
      if (!isVisible) { playingRef.current = false; setPlaying(false); }
    };
    visible(); document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  // Only the current server gate can move the demo; historical events never trigger writes.
  useEffect(() => {
    const runId = state.presentation?.runId;
    if (!open || !runId) return;
    setWatchVisible(true);
    setSide('chat');
    setPresentationReady('');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flip = window.setTimeout(() => {
      setSide('trace');
      // On a narrow screen the drawer may still be scrolled to the composer.
      drawer.current?.querySelector('.hb-demo-stage')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, reduced ? 30 : 500);
    const ready = window.setTimeout(() => setPresentationReady(runId), reduced ? 80 : 1150);
    return () => { clearTimeout(flip); clearTimeout(ready); };
  }, [open, state.presentation?.runId]);
  useEffect(() => {
    const runId = state.presentation?.runId;
    if (!open || side !== 'trace' || !pageVisible || !state.owner || !runId || !watchReady || presentationReady !== runId || presentationAcks.current.has(runId) || presentationInFlight.current.has(runId)) return;
    presentationInFlight.current.add(runId);
    void demoRequest('/api/demo/present', { runId }).then(() => { presentationAcks.current.add(runId); }).catch(e => setError((e as Error).message)).finally(() => presentationInFlight.current.delete(runId));
  }, [open, side, state, watchReady, presentationReady, pageVisible]);
  useEffect(() => { if (!open) return; history.current?.scrollTo({ top: history.current.scrollHeight, behavior: 'instant' }); }, [open, state.messages.length, state.busy, working]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    drawer.current?.querySelector<HTMLButtonElement>('.hb-demo-close')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); playingRef.current = false; setPlaying(false); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []);
      const visible = nodes.filter(node => !node.closest('[inert]'));
      const first = visible[0], last = visible[visible.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open]);
  function close() { playingRef.current = false; setPlaying(false); setOpen(false); }
  async function startSession() {
    const current = await refresh();
    if (current.active && !current.owner) throw new Error('Your demo controls have expired. Please reset your demo.');
    if (current.active && current.owner) return current;
    const result = await demoRequest('/api/demo/start', {});
    if (typeof result.token === 'string') { sessionStorage.setItem(TOKEN_KEY, result.token); publishState(normalize(result)); }
    const next = await refresh();
    window.dispatchEvent(new Event('hb:data-changed'));
    if (!next.messages.some(m => m.role === 'user')) { sessionStorage.removeItem(STEP_ID_KEY); sessionStorage.removeItem(PENDING_KEY); setPendingIndex(null); }
    return next;
  }
  async function sendReport(senderId: string, text: string, messageId = crypto.randomUUID()) {
    await demoRequest('/api/demo/message', { conversationId: 'queens-pork-demo', fixtureId: 'demo-gw7-1', messageId, senderId, text, timestamp: new Date().toISOString() });
    const next = await refresh();
    window.dispatchEvent(new Event('hb:data-changed'));
    return next;
  }
  async function play() {
    if (playingRef.current) { playingRef.current = false; setPlaying(false); return; }
    playingRef.current = true; setPlaying(true); setError(''); setWorking(true);
    try {
      let next = await startSession();
      while (playingRef.current) {
        const pending = sessionStorage.getItem(PENDING_KEY);
        const index = pending === null ? progressFrom(next.messages) : Number(pending);
        if (index >= SCRIPT.length) break;
        if (!next.owner) throw new Error('Your demo session has expired. Please reset it.');
        const ids = JSON.parse(sessionStorage.getItem(STEP_ID_KEY) || '{}') as Record<string, string>;
        const messageId = ids[index] || crypto.randomUUID();
        ids[index] = messageId; sessionStorage.setItem(STEP_ID_KEY, JSON.stringify(ids));
        const step = SCRIPT[index];
        sessionStorage.setItem(PENDING_KEY, String(index)); setPendingIndex(index);
        next = await sendReport(step.senderId, step.text, messageId);
        sessionStorage.removeItem(PENDING_KEY); setPendingIndex(null);
        if (progressFrom(next.messages) <= index) throw new Error('The message has not appeared in your chat yet. Pause and try again.');
        if (playingRef.current && index < SCRIPT.length - 1) { setWorking(false); await new Promise(resolve => setTimeout(resolve, 2200)); if (!stateRef.current.presentation) setSide('chat'); await new Promise(resolve => setTimeout(resolve, 1200)); setWorking(true); next = stateRef.current; }
      }
    } catch (e) { setError((e as Error).message); } finally { playingRef.current = false; setPlaying(false); setWorking(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault(); const text = message.trim(); if (!text || working || playing) return;
    setWorking(true); setError('');
    try { await startSession(); await sendReport(sender, text); setMessage(''); } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  async function resetSession() {
    playingRef.current = false; setPlaying(false); setWorking(true); setError('');
    try {
      const result = await demoRequest('/api/demo/reset', {});
      if (typeof result.token !== 'string') throw new Error('The new demo could not be opened. Please try again.');
      sessionStorage.setItem(TOKEN_KEY, result.token);
      for (const key of [PROGRESS_KEY, PENDING_KEY, STEP_ID_KEY]) sessionStorage.removeItem(key);
      presentationAcks.current.clear(); presentationInFlight.current.clear();
      setPendingIndex(null); setMessage(''); setSide('chat'); setWatchVisible(false); setWatchReady(false); setPresentationReady('');
      publishState(normalize(result));
      window.dispatchEvent(new Event('hb:data-changed'));
    } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  async function release() {
    playingRef.current = false; setPlaying(false); setWorking(true); setError('');
    try { await demoRequest('/api/demo/release', {}); await refresh(); } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  const progress = Math.min(progressFrom(state.messages), pendingIndex ?? SCRIPT.length);
  const locked = state.active && !state.owner;
  const unavailable = !state.configured;
  const latestEvent = state.events[state.events.length - 1];
  return <>
    <button ref={trigger} className={`hb-demo-trigger ${open ? 'hb-demo-trigger-hidden' : ''}`} onClick={show} aria-label="Open the WhatsApp match reporter demonstration" aria-expanded={open} aria-controls="hb-demo-drawer"><ChevronLeft size={19} /><span className="hb-demo-trigger-icon"><Phone size={18} /></span><span>TRY THE LIVE DEMO</span><i /></button>
    {open && <div className="hb-demo-overlay"><button className="hb-demo-backdrop" aria-label="Close demonstration" onClick={close} tabIndex={-1} /><aside id="hb-demo-drawer" ref={drawer} className={`hb-demo-drawer ${watchVisible ? 'hb-demo-drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="hb-demo-title"><div className="hb-demo-drawer-top"><div><p>THE MATCH REPORTER</p><h2 id="hb-demo-title">A chat. A result. All sorted.</h2></div><button className="hb-demo-close" aria-label="Close demonstration" onClick={close}><X size={22} /></button></div><p className="hb-demo-intro">Watch a conversation become a match report. The league table updates as the details come in.</p><div className="hb-demo-controls"><button className="hb-demo-play" disabled={loading || locked || unavailable || (!playing && (working || state.busy)) || (progress >= SCRIPT.length && !playing)} onClick={() => void play()}>{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}{playing ? 'Pause demo' : progress >= SCRIPT.length ? 'Demo complete' : progress > 0 ? 'Continue demo' : 'Play demo'}</button><button className="hb-demo-reset" type="button" onClick={() => void resetSession()} disabled={loading || working || state.busy} aria-label="Reset your demo"><RotateCcw size={14} />Reset demo</button><span>{loading ? 'Connecting…' : locked ? <><Radio size={12} /> Watching live</> : playing ? `Message ${Math.min(progress + 1, SCRIPT.length)} of ${SCRIPT.length}` : progress > 0 ? `${progress} of ${SCRIPT.length} messages` : 'About 2 minutes'}</span></div><div className="hb-demo-stage">{watchVisible && <div className="hb-demo-website"><LiveMatchWatch sessionToken={token()} onUnavailable={onWatchUnavailable} onReady={onWatchReady} /></div>}<div className="hb-demo-phone-zone"><div className="hb-demo-view-switch" role="group" aria-label="Phone view"><button type="button" aria-pressed={side === 'chat'} onClick={() => setSide('chat')}>Group chat</button><button type="button" aria-pressed={side === 'trace'} onClick={() => { setWatchVisible(true); setSide('trace'); }}>Agent activity <span>{state.events.filter(e => e.traceId).length}</span></button></div><div className={`hb-demo-flip ${side === 'trace' ? 'hb-demo-flipped' : ''}`}><div className="hb-demo-flip-inner"><div className="hb-demo-phone hb-demo-face hb-demo-chat-face" aria-hidden={side !== 'chat'} inert={side !== 'chat'}><div className="hb-demo-phone-top"><span>9:41</span><span className="hb-demo-island" /><span>▰ ▰ ▰</span></div><header className="hb-demo-chat-header"><ChevronLeft size={23} /><span className="hb-demo-group-avatar">QPR<span>⚽</span></span><div><h3>Queens Pork Rangers</h3><p>Ben, Alfie, Sam, Leo, Match Reporter</p></div><Video size={19} className="hb-demo-header-decoration" /><Phone size={17} className="hb-demo-header-decoration" /><MoreVertical size={19} className="hb-demo-header-decoration" /></header><div className="hb-demo-conversation" ref={history} role="log" aria-label="Demonstration group conversation" aria-live="polite" aria-relevant="additions"><div className="hb-demo-day">TODAY</div><div className="hb-demo-chat-notice"><LockKeyhole size={10} /> This is a fictional group chat for the demonstration. Only you see this demo. No real WhatsApp messages are sent.</div>{state.messages.length === 0 && !loading && <div className="hb-demo-empty"><span>⚽</span><strong>Full-time. Who’s got the score?</strong><p>Press Play demo or write a message below to start the conversation.</p></div>}{loading && state.messages.length === 0 && <div className="hb-demo-connecting"><LoaderCircle size={18} /> Connecting to the clubhouse…</div>}{state.messages.map(m => { const agent = isAgent(m), info = senderInfo(m.sender), outgoing = !agent && info?.id === 'ben'; const date = new Date(m.createdAt); return <article key={m.id} className={`hb-demo-bubble ${outgoing ? 'hb-demo-outgoing' : ''} ${agent ? 'hb-demo-agent' : ''}`}><div className="hb-demo-sender" style={{ color: agent ? '#d8bd76' : info?.color || '#a3d5c2' }}>{agent ? <><Bot size={11} /> Match Reporter</> : info?.label || m.sender}</div><p>{m.text}</p><div className="hb-demo-message-time"><time dateTime={m.createdAt}>{isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>{outgoing && <CheckCheck size={13} />}</div></article>; })}{(working || state.busy) && <div className="hb-demo-typing" role="status"><Bot size={12} /><span>Match Reporter is reading</span><i /><i /><i /></div>}</div><div className="hb-demo-sender-select"><label htmlFor="hb-demo-sender">Send as</label><select id="hb-demo-sender" value={sender} onChange={e => setSender(e.target.value)} disabled={locked || working || playing}>{senders.map(s => <option key={s.id} value={s.id}>{s.label} · {s.team}</option>)}</select><ChevronDown size={12} /></div><form className="hb-demo-composer" onSubmit={send}><div><Smile size={19} aria-hidden="true" /><input aria-label="Message the group" value={message} onChange={e => setMessage(e.target.value)} placeholder={locked ? 'Watching another demo…' : 'Type a message'} maxLength={600} disabled={locked || unavailable || working || playing || state.busy} /><Paperclip size={18} aria-hidden="true" /></div><button type="submit" aria-label="Send message" disabled={!message.trim() || locked || unavailable || working || playing || state.busy}><Send size={18} /></button></form><div className="hb-demo-phone-bottom"><span /></div></div><div className="hb-demo-phone hb-demo-face hb-demo-trace-face" aria-hidden={side !== 'trace'} inert={side !== 'trace'}><TraceReadout events={state.events} busy={state.busy || working} preparing={!!state.presentation} /></div></div></div></div></div>{error && <div className="hb-demo-error" role="alert"><AlertCircle size={15} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}{unavailable && <div className="hb-demo-error" role="status"><AlertCircle size={15} /><span>The match reporter is not configured yet. The website and manual admin editing remain available.</span></div>}{locked && <p className="hb-demo-watch-note">This demo session needs to be restarted. Use Reset demo.</p>}{state.match && state.match.homeScore !== null && state.match.awayScore !== null && <section className="hb-demo-live-result" aria-label="Saved match result" aria-live="polite"><p><span />SAVED TO THE WEBSITE</p><div><span>{state.match.homeName}</span><strong>{state.match.homeScore}<i>–</i>{state.match.awayScore}</strong><span>{state.match.awayName}</span></div><footer><span>League points <b>{state.match.homePoints ?? '—'} / {state.match.awayPoints ?? '—'}</b></span><span>{state.match.shootoutWinnerName ? `${state.match.shootoutWinnerName} won shootout` : 'Shootout pending'}</span></footer></section>}<section className="hb-demo-activity"><button className="hb-demo-activity-toggle" onClick={() => setShowLog(v => !v)} aria-expanded={showLog} aria-controls="hb-demo-log"><span className={`hb-demo-activity-dot ${working || state.busy ? 'is-working' : ''}`} /><span>{working || state.busy ? 'Reading the chat and updating the report…' : latestEvent?.label || 'Ready to update the league'}</span><ChevronRight className={showLog ? 'is-open' : ''} size={16} /></button>{showLog && <div className="hb-demo-log" id="hb-demo-log"><p>The agent calls the league’s MCP tools to read and update match details.</p>{state.events.length === 0 ? <small>Tool activity appears here as the demo runs.</small> : [...state.events].reverse().map(event => <details key={event.id}><summary><span>{event.label}</span><small>{event.status}</small></summary>{event.tool && <p>Tool: {event.tool}</p>}{event.arguments !== undefined && <><b>Request</b><pre>{JSON.stringify(event.arguments, null, 2)?.slice(0, 12000)}</pre></>}{event.result !== undefined && <><b>Response</b><pre>{JSON.stringify(event.result, null, 2)?.slice(0, 12000)}</pre></>}</details>)}</div>}</section><footer className="hb-demo-footer"><p>Your private demo · fictional season</p><div>{state.owner && state.active && <button disabled={working || state.busy} onClick={() => void release()}>Release controls</button>}<a href="/admin">Club admin</a></div></footer></aside></div>}
  </>;
}
