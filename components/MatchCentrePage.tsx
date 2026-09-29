'use client';
import { useCallback, useEffect, useState } from 'react';
import MatchCentre from './MatchCentre';
import { acceptsFrameMessage } from '../lib/match-frame';

export default function MatchCentrePage() {
  const [session, setSession] = useState<{ token: string; channel: string } | null>(null);
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    const framed = window.parent !== window;
    setEmbedded(framed);
    if (!framed) {
      setSession({ token: sessionStorage.getItem('heavy-ballers-demo-token') || '', channel: '' });
      return;
    }
    const receive = (event: MessageEvent) => {
      if (!acceptsFrameMessage(event, window.location.origin, window.parent)) return;
      if (event.data.type === 'hb:match-session' && typeof event.data.token === 'string' && typeof event.data.channel === 'string') {
        setSession(current => current && current.token === event.data.token && current.channel === event.data.channel ? current : { token: event.data.token, channel: event.data.channel });
      }
      if (event.data.type === 'hb:match-refresh') window.dispatchEvent(new Event('hb:data-changed'));
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'hb:match-connect' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  const notifyReady = useCallback((revision: number) => {
    if (embedded && session) window.parent.postMessage({ type: 'hb:match-ready', channel: session.channel, revision }, window.location.origin);
  }, [embedded, session]);
  const notifyUnavailable = useCallback(() => {
    if (embedded && session) window.parent.postMessage({ type: 'hb:match-unavailable', channel: session.channel }, window.location.origin);
  }, [embedded, session]);
  return <main className={embedded ? 'hb-match-page hb-demo-website' : 'hb-match-page'}>
    {!embedded && <nav className="hb-match-page-nav"><a href="/">← Kensington Heavy Ballers</a><span>{session?.token ? 'Your private demo match' : 'Fictional demo season'}</span></nav>}
    {session ? <MatchCentre key={session.channel} sessionToken={session.token} onReady={notifyReady} onUnavailable={notifyUnavailable}/> : <p role="status">Connecting to your private demo…</p>}
  </main>;
}
