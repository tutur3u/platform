/**
 * Start the client bundle after the first paint.
 *
 * The server-rendered page is complete and readable without JavaScript, but
 * the SSR document asks for ~200 KB of modules up front (modulepreload links
 * plus an async entry). On a slow phone those compete with the stylesheet,
 * fonts and HTML for bandwidth and delay the first paint. The Worker rewrites
 * the document before hashing its inline scripts:
 *
 * - each `<link rel="modulepreload">` keeps its element and href but gets the
 *   inert rel `roadmap-modulepreload`, so nothing is fetched;
 * - the entry `<script type="module" async src>` keeps its element and src
 *   but becomes `type="text/plain"`, which browsers never fetch or run (the
 *   asset smoke still sees and checks its src);
 * - one static inline script then, once the browser has reported the first
 *   (largest) contentful paint and the load event has fired, waits one more
 *   frame (4 s at the latest), turns the hints back into modulepreload links
 *   and imports the entry. Like the router's own stream scripts, it removes
 *   itself as it runs.
 *
 * Elements stay where React rendered them, so hydration matches. Nothing is
 * prefetched or prerendered (the zone 503s Sec-Purpose: prefetch).
 */
export const DEFERRED_PRELOAD_REL = 'roadmap-modulepreload';
export const DEFERRED_ENTRY_ATTRIBUTE = 'data-roadmap-entry';

/** Static, so its CSP hash is the same for every page and build. */
export const HYDRATION_LOADER = `document.currentScript.remove();(()=>{let d=0;const go=()=>{if(d)return;d=1;for(const h of document.querySelectorAll('link[rel="${DEFERRED_PRELOAD_REL}"]')){const l=document.createElement('link');l.rel='modulepreload';l.href=h.getAttribute('href');document.head.append(l)}const e=document.querySelector('script[${DEFERRED_ENTRY_ATTRIBUTE}]');if(e)import(e.getAttribute('src'))};let painted=0,loaded=document.readyState==='complete';const check=()=>{if(painted&&loaded)requestAnimationFrame(()=>setTimeout(go,0))};try{const types=PerformanceObserver.supportedEntryTypes||[];new PerformanceObserver((list,o)=>{o.disconnect();painted=1;check()}).observe({type:types.includes('largest-contentful-paint')?'largest-contentful-paint':'paint',buffered:true})}catch(e){painted=1}if(!loaded)addEventListener('load',()=>{loaded=1;check()},{once:true});check();setTimeout(go,4000)})()`;

const MODULE_PRELOAD =
  /<link\b(?=[^>]*\brel="modulepreload")([^>]*\bhref="\/roadmap\/assets\/[^"]+\.js"[^>]*)>/g;
const MODULE_ENTRY =
  /<script type="module" async="" src="(\/roadmap\/assets\/[^"]+\.js)"><\/script>/;

export function deferHydration(html: string): string {
  const entry = MODULE_ENTRY.exec(html);
  if (!entry) return html;
  return html
    .replace(
      MODULE_PRELOAD,
      (_tag, attributes: string) =>
        `<link${attributes.replace('rel="modulepreload"', `rel="${DEFERRED_PRELOAD_REL}"`)}>`
    )
    .replace(
      entry[0],
      `<script type="text/plain" ${DEFERRED_ENTRY_ATTRIBUTE}="" src="${entry[1]}"></script><script>${HYDRATION_LOADER}</script>`
    );
}
