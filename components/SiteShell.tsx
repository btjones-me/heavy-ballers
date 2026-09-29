'use client';
import { useEffect, useState } from 'react';
import PublicSite from './PublicSite';
import DemoPhone from './DemoPhone';
import ArchitecturePanel from './ArchitecturePanel';
import MatchCentrePage from './MatchCentrePage';
import Admin from './Admin';

export function isPublicPage(path:string) {
  return /^\/$|^\/(teams|tables)\/(tuesday|saturday)\/?$|^\/(scores-and-fixtures|privacy-policy|match-centre|admin)\/?$/.test(path);
}

export function normalizePagePath(path:string) { return path.replace(/\/+$/, '') || '/'; }

// Keep the reporter mounted while navigating public league pages. URLs, Back,
// modified clicks and direct links still work as normal browser navigation.
export default function SiteShell({initialPath}:{initialPath:string}) {
  const [path,setPath]=useState(normalizePagePath(initialPath));
  useEffect(()=>{
    const sync=()=>setPath(normalizePagePath(window.location.pathname));
    const navigate=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element)?.closest?.('a');
      if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
      const url=new URL(link.href,window.location.href);
      if(url.origin!==window.location.origin||!isPublicPage(url.pathname))return;
      event.preventDefault();
      window.history.pushState(null,'',url.pathname+url.search+url.hash);setPath(normalizePagePath(url.pathname));
      requestAnimationFrame(()=>{if(url.hash)document.getElementById(url.hash.slice(1))?.scrollIntoView();else window.scrollTo(0,0);});
    };
    document.addEventListener('click',navigate);window.addEventListener('popstate',sync);
    return()=>{document.removeEventListener('click',navigate);window.removeEventListener('popstate',sync);};
  },[]);
  return <>{path==='/match-centre'?<MatchCentrePage/>:path==='/admin'?<Admin/>:<PublicSite key={path} path={path}/>}<DemoPhone/><ArchitecturePanel/></>;
}
