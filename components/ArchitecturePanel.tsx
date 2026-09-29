'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, Code2, Database, ImageIcon, Layers3, MessageSquare, ShieldCheck, X } from 'lucide-react';
import './architecture.css';

const stack = [
  { icon: Code2, title: 'The website', name: 'React · TypeScript · Vinext', description: 'Next.js App Router conventions, compiled for a Cloudflare Worker. The same interface serves visitors and the password-protected admin.' },
  { icon: Layers3, title: 'The backend', name: 'Cloudflare Worker · Sites', description: 'Server-side routes run the chat agent, protect credentials and validate changes through one shared league service.' },
  { icon: MessageSquare, title: 'The match reporter', name: 'OpenAI GPT-6 Luna · HTTP MCP', description: 'The model reads the conversation and selects MCP tools. A separate server-held credential protects the tools that find fixtures, read squads and update results.' },
  { icon: Database, title: 'League records', name: 'Cloudflare D1', description: 'Teams, players, fixtures, match reports and change history live in a relational database. Tables and scorer rankings are calculated from saved results.' },
  { icon: ImageIcon, title: 'Photography', name: 'Cloudflare R2', description: 'Admin uploads are stored separately from league data and served back to the website.' },
];

export default function ArchitecturePanel() {
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const skipRestore = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => {
    skipRestore.current = false;
    window.dispatchEvent(new CustomEvent('hb-drawer-open', { detail: 'architecture' }));
    setOpen(true);
  }, []);

  useEffect(() => {
    const otherDrawer = (event: Event) => {
      if ((event as CustomEvent).detail !== 'demo') return;
      skipRestore.current = true;
      setOpen(false);
    };
    window.addEventListener('hb-drawer-open', otherDrawer);
    return () => window.removeEventListener('hb-drawer-open', otherDrawer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const fallbackFocus = trigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector<HTMLButtonElement>('.hb-architecture-close')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !drawer.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      if (!skipRestore.current) (previouslyFocused?.isConnected ? previouslyFocused : fallbackFocus)?.focus();
    };
  }, [open, close]);

  return <>
    <button ref={trigger} className={`hb-architecture-trigger${open ? ' is-hidden' : ''}`} onClick={show} aria-label="Open architecture and technology stack" aria-expanded={open} aria-controls="hb-architecture-drawer">
      <ChevronLeft size={15} aria-hidden="true" /><Layers3 className="hb-architecture-trigger-icon" size={18} aria-hidden="true" /><span>HOW IT WORKS</span>
    </button>
    {open && <div className="hb-architecture-overlay">
      <button className="hb-architecture-backdrop" aria-label="Close architecture panel" onClick={close} tabIndex={-1} />
      <aside ref={drawer} id="hb-architecture-drawer" className="hb-architecture-drawer" role="dialog" aria-modal="true" aria-labelledby="hb-architecture-title">
        <header className="hb-architecture-header">
          <div><p>BEHIND THE CLUBHOUSE</p><h2 id="hb-architecture-title">From chat to league table.</h2></div>
          <button className="hb-architecture-close" onClick={close} aria-label="Close architecture panel"><X size={22} /></button>
        </header>
        <div className="hb-architecture-content">
          <p className="hb-architecture-intro">A small website with a real backend. Here’s how the live demo reads a match report and turns it into an updated season.</p>
          <figure className="hb-architecture-figure">
            <a href="/assets/architecture-stack-luna.png" target="_blank" rel="noopener noreferrer" aria-label="Open architecture diagram at full size in a new tab">
              <img src="/assets/architecture-stack-luna.png" alt="Heavy Ballers architecture: the chat demo sends messages to a Worker-hosted OpenAI agent; authenticated MCP tools call the shared league service and D1 database. Admin uses the same service, R2 stores photos, and the website refreshes saved results." />
              <span>Explore the diagram <ArrowUpRight size={14} aria-hidden="true" /></span>
            </a>
            <figcaption>Open the diagram at full size. The same flow is explained below.</figcaption>
          </figure>
          <section className="hb-architecture-flow" aria-labelledby="hb-architecture-flow-title">
            <div className="hb-architecture-section-label">THE LIVE FLOW</div>
            <h3 id="hb-architecture-flow-title">One report. One source of truth.</h3>
            <ol>
              <li><b>A player reports the result.</b> The fictional chat sends each message to the backend.</li>
              <li><b>The agent checks the details.</b> GPT-6 Luna reads the conversation, uses MCP tools and asks for missing or unclear information.</li>
              <li><b>The league service saves valid changes.</b> Team, player, score and revision checks protect the shared records in D1.</li>
              <li><b>The website catches up.</b> Results, standings and goalscorers refresh automatically every 2.5 seconds.</li>
            </ol>
          </section>
          <section className="hb-architecture-stack" aria-labelledby="hb-architecture-stack-title">
            <div className="hb-architecture-section-label">THE STACK</div>
            <h3 id="hb-architecture-stack-title">Built for the weekly game.</h3>
            <div className="hb-architecture-cards">{stack.map(({ icon: Icon, title, name, description }) => <article key={title}>
              <Icon size={19} aria-hidden="true" /><div><p>{title}</p><h4>{name}</h4><p>{description}</p></div>
            </article>)}</div>
          </section>
          <div className="hb-architecture-assurance"><ShieldCheck size={19} aria-hidden="true" /><p><b>Shared rules, protected changes.</b> Admin and the agent use the same league service. The demo can update only its fictional season; credentials stay on the server and AI calls have a £5 monthly ceiling.</p></div>
          <section className="hb-architecture-future"><span>WHAT COMES NEXT</span><h3>A path to real WhatsApp.</h3><p>A future WhatsApp adapter could send the same message events to a hosted agent using these MCP tools. This demonstration is a mock chat: no live WhatsApp integration is connected.</p></section>
        </div>
      </aside>
    </div>}
  </>;
}
