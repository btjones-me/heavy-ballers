'use client';
import { useEffect, useRef } from 'react';
import { Activity, Check, CircleDashed, Clock3, Terminal, TriangleAlert } from 'lucide-react';

export type DemoEvent = {
  id: string; label: string; status: string; tool?: string; arguments?: unknown; result?: unknown; createdAt: string;
  traceId?: string; runId?: string; kind?: 'mcp' | 'ai'; method?: string; endpoint?: string;
  httpStatus?: number | null; durationMs?: number | null; phase?: string;
};

function important(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(important);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const priority = ['isError', 'saved', 'patch', 'homeScore', 'awayScore', 'shootoutWinnerId', 'homeScorers', 'awayScorers', 'fixtureId', 'expectedVersion', 'version'];
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (priority.includes(a) ? priority.indexOf(a) : 100) - (priority.includes(b) ? priority.indexOf(b) : 100)).map(([key, item]) => [key, important(item)]));
}
function pretty(value: unknown) {
  const json = JSON.stringify(important(value), null, 2) ?? 'null';
  return json.length > 8000 ? `${json.slice(0, 8000)}\n… response truncated for display` : json;
}

export default function TraceReadout({ events, busy, preparing }: { events: DemoEvent[]; busy: boolean; preparing: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  // A completed event replaces its running entry in place, preserving call order.
  const calls = new Map<string, DemoEvent>();
  for (const event of events) if (event.traceId || event.kind) calls.set(event.traceId || event.id, event);
  const traces = [...calls.values()];
  const latest = traces[traces.length - 1];
  const lastWrite = traces.map(event => event.tool).lastIndexOf('update_match_report');
  const focusIndex = !busy && lastWrite >= 0 ? lastWrite : traces.length - 1;
  const focused = traces[focusIndex];
  useEffect(() => {
    area.current?.querySelector<HTMLElement>('[data-latest="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [focused?.id, focused?.status, focusIndex]);
  return <>
    <div className="hb-trace-top"><Terminal size={19} /><div><h3>Agent activity</h3><p>Live requests · actual server responses</p></div><span className={busy ? 'is-running' : ''} /></div>
    <div className="hb-trace-status" role="status"><Activity size={14} /><span>{preparing ? 'Website in view. Preparing to save…' : busy ? 'Agent processing the match report…' : latest?.status === 'error' || events[events.length - 1]?.status === 'error' ? 'Latest request failed — see details below' : traces.length ? 'Latest run complete' : 'Waiting for the first message'}</span></div>
    <div className="hb-trace-calls" ref={area} aria-label="Agent network activity">
      {!traces.length && <div className="hb-trace-empty"><Terminal size={32} /><strong>The agent’s work, made visible.</strong><p>AI requests and MCP tool calls appear here with JSON, status codes and response times.</p></div>}
      {traces.map((event, index) => {
        const running = event.status === 'running';
        const failed = event.status === 'error';
        const envelope = event.arguments as { arguments?: unknown } | undefined;
        const request = (event.tool ? envelope?.arguments : undefined) ?? event.arguments ?? { method: event.method, endpoint: event.endpoint };
        return <details className={`hb-trace-call ${running ? 'is-running' : failed ? 'is-error' : 'is-success'}`} key={event.traceId || event.id} open={index === focusIndex || running} data-latest={index === focusIndex}>
          <summary><span className="hb-trace-kind">{event.kind === 'ai' ? 'AI' : 'MCP'}</span><span className="hb-trace-name">{event.tool || event.label}</span>{running ? <CircleDashed size={14} className="hb-trace-spinner" /> : failed ? <TriangleAlert size={14} /> : <Check size={14} />}</summary>
          <div className="hb-trace-meta"><code>{event.method || 'POST'} {event.endpoint || (event.kind === 'mcp' ? '/api/mcp' : '/v1/responses')}</code><span>{event.httpStatus != null ? `HTTP ${event.httpStatus}` : running ? 'In flight' : 'No HTTP response'}</span><span><Clock3 size={10} />{event.durationMs != null ? `${Math.round(event.durationMs).toLocaleString()} ms` : '…'}</span></div>
          <div className="hb-trace-payload"><h4>{event.tool ? 'Tool arguments' : 'Request'} <span>JSON</span></h4><pre tabIndex={0} aria-label={`${event.tool || event.label} request`}>{pretty(request)}</pre><h4>Response <span>{running ? 'WAITING' : 'JSON'}</span></h4>{running ? <p className="hb-trace-wait"><span /> Awaiting server response…</p> : <pre tabIndex={0} aria-label={`${event.tool || event.label} response`}>{pretty(event.result ?? { status: event.status })}</pre>}</div>
        </details>;
      })}
    </div>
    <footer className="hb-trace-foot">Server activity only · credentials never displayed</footer>
  </>;
}
