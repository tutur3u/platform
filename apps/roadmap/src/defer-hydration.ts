/**
 * Start the client bundle after the first paint, or at the reader's first
 * intent, whichever comes first.
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
 * - one static inline script (it removes itself, like the router's stream
 *   scripts) turns the hints back into modulepreload links (the fetch
 *   starts) on the first pointerdown, touchstart, keydown or focusin
 *   anywhere, or once the largest contentful paint is reported, in an idle
 *   period within IDLE_TIMEOUT_MS; FALLBACK_MS caps the wait. It imports the
 *   entry one frame later, so the tap that started it paints first.
 *
 * A click on a button that is not hydrated yet would do nothing, so the
 * loader records it (and stops it, so React never also sees it) and clicks
 * that button again once React has attached its props: the first tap is
 * never lost. Links and <summary> keep their native behaviour and are not
 * touched. Elements stay where React rendered them, so hydration matches.
 * Nothing is prefetched or prerendered (the zone 503s Sec-Purpose: prefetch).
 */
export const DEFERRED_PRELOAD_REL = 'roadmap-modulepreload';
export const DEFERRED_ENTRY_ATTRIBUTE = 'data-roadmap-entry';
export const INTENT_EVENTS = [
  'pointerdown',
  'touchstart',
  'keydown',
  'focusin',
] as const;
/** After the largest contentful paint, load in the next idle period or by this. */
export const IDLE_TIMEOUT_MS = 1_000;
/** Load by this time even if neither a paint nor an intent was reported. */
export const FALLBACK_MS = 4_000;

/** Static, so its CSP hash is the same for every page and build. */
export const HYDRATION_LOADER = `document.currentScript.remove();(()=>{
let started=0,pending=null;
const intents=${JSON.stringify(INTENT_EVENTS)},opts={capture:true,passive:true};
const hydrated=(el)=>Object.keys(el).some((key)=>key.startsWith('__reactProps'));
const replay=()=>{let frames=0;const tick=()=>{const el=pending;if(!el||!el.isConnected)return;if(hydrated(el)){pending=null;el.click();return}if(++frames<600)requestAnimationFrame(tick)};tick()};
const start=()=>{if(started)return;started=1;for(const type of intents)removeEventListener(type,start,opts);
for(const hint of document.querySelectorAll('link[rel="${DEFERRED_PRELOAD_REL}"]')){const link=document.createElement('link');link.rel='modulepreload';link.href=hint.getAttribute('href');document.head.append(link)}
requestAnimationFrame(()=>setTimeout(()=>{const entry=document.querySelector('script[${DEFERRED_ENTRY_ATTRIBUTE}]');if(entry)import(entry.getAttribute('src')).then(replay,()=>{})},0))};
for(const type of intents)addEventListener(type,start,opts);
addEventListener('click',(event)=>{const button=event.target&&event.target.closest?event.target.closest('button'):null;if(!button||hydrated(button))return;pending=button;event.stopImmediatePropagation();start();if(started)replay()},true);
const idle=()=>(window.requestIdleCallback||((cb)=>setTimeout(cb,1)))(start,{timeout:${IDLE_TIMEOUT_MS}});
try{const types=PerformanceObserver.supportedEntryTypes||[];new PerformanceObserver((list,observer)=>{observer.disconnect();idle()}).observe({type:types.includes('largest-contentful-paint')?'largest-contentful-paint':'paint',buffered:true})}catch(error){idle()}
setTimeout(start,${FALLBACK_MS})})()`;

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
