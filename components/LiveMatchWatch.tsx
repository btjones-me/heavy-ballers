'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { acceptsFrameMessage } from '../lib/match-frame';
import './live-watch.css';

type Props = { sessionToken: string; onReady: () => void; onUnavailable: () => void };
export default function LiveMatchWatch({ sessionToken, onReady, onUnavailable }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const channel = useRef('');
  const [connected, setConnected] = useState(false);
  const [reload, setReload] = useState(0);
  const connect = useCallback(() => {
    if (!channel.current) return;
    frame.current?.contentWindow?.postMessage({ type: 'hb:match-session', channel: channel.current, token: sessionToken }, window.location.origin);
  }, [sessionToken]);
  useEffect(() => {
    channel.current = crypto.randomUUID();
    setConnected(false); onUnavailable();
    const receive = (event: MessageEvent) => {
      if (!acceptsFrameMessage(event, window.location.origin, frame.current?.contentWindow)) return;
      if (event.data.type === 'hb:match-connect') { connect(); return; }
      if (event.data.channel !== channel.current) return;
      if (event.data.type === 'hb:match-ready') { setConnected(true); onReady(); }
      if (event.data.type === 'hb:match-unavailable') { setConnected(false); onUnavailable(); }
    };
    window.addEventListener('message', receive); connect();
    const refresh = () => frame.current?.contentWindow?.postMessage({ type: 'hb:match-refresh', channel: channel.current }, window.location.origin);
    window.addEventListener('hb:data-changed', refresh);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('hb:data-changed', refresh); };
  }, [connect, reload, onReady, onUnavailable]);
  return <section className="hb-match-frame" aria-label="Live website iframe">
    <div className="hb-match-frame-label"><div><strong>Live website · iframe</strong><span>{connected ? 'Your private demo · refreshes automatically' : 'Connecting to your private demo…'}</span></div><button type="button" onClick={() => setReload(n => n + 1)}>Reload view</button></div>
    <iframe key={reload} ref={frame} src="/match-centre?embed=1" title="Heavy Ballers live match centre — embedded website" onLoad={connect}/>
    <a href="/match-centre">Open full match centre ↗</a>
  </section>;
}
