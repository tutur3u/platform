/**
 * Self-contained stylesheet for the status page. It ships as a server-rendered
 * `<style>` so the page needs neither Tailwind source scanning nor client JS:
 * light by default, dark from `prefers-color-scheme` unless an ancestor has the
 * `.light` theme class, and dark whenever an ancestor has `.dark`. Values
 * mirror `--root-background`, `--foreground`, `--muted-foreground` and
 * `--border` in `@tuturuuu/ui/globals.css`.
 */
const LIGHT = `--ttr-sp-bg:hsl(20 60% 98%);--ttr-sp-surface:hsl(0 0% 100%);--ttr-sp-fg:hsl(0 0% 3.9%);--ttr-sp-muted:hsl(0 0% 34%);--ttr-sp-faint:hsl(20 14% 84%);--ttr-sp-border:hsl(0 0% 87%);--ttr-sp-ring:hsl(0 0% 3.9%);color-scheme:light;`;
const DARK = `--ttr-sp-bg:hsl(0 4% 8%);--ttr-sp-surface:hsl(0 0% 3.9%);--ttr-sp-fg:hsl(0 0% 98%);--ttr-sp-muted:hsl(0 0% 70%);--ttr-sp-faint:hsl(0 0% 22%);--ttr-sp-border:hsl(0 0% 18%);--ttr-sp-ring:hsl(0 0% 90%);color-scheme:dark;`;

export const STATUS_PAGE_STYLE_ID = 'tuturuuu-status-page';

export const STATUS_PAGE_CSS = [
  `.ttr-sp{${LIGHT}box-sizing:border-box;display:flex;flex-direction:column;width:100%;min-height:100dvh;background:var(--ttr-sp-bg);color:var(--ttr-sp-fg);font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif);line-height:1.5;-webkit-font-smoothing:antialiased;text-align:left}`,
  `@media (prefers-color-scheme:dark){.ttr-sp:not(.light *){${DARK}}}`,
  `.dark .ttr-sp{${DARK}}`,
  `.ttr-sp *,.ttr-sp *::before,.ttr-sp *::after{box-sizing:border-box}`,
  `.ttr-sp[data-chrome=inline]{min-height:min(40rem,75vh);border:1px solid var(--ttr-sp-border);border-radius:1rem}`,
  `.ttr-sp a{color:inherit;text-decoration:none}`,
  `.ttr-sp :focus-visible{outline:2px solid var(--ttr-sp-ring);outline-offset:2px;border-radius:.5rem}`,
  `.ttr-sp__bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;max-width:72rem;margin:0 auto;padding:1rem}`,
  `.ttr-sp__lockup{display:flex;align-items:center;gap:.625rem;min-width:0}`,
  `.ttr-sp__brand{display:inline-flex;flex:none;align-items:center;gap:.5rem;font-weight:700;font-size:1.125rem;letter-spacing:-.01em}`,
  `.ttr-sp__brand svg{width:1.75rem;height:1.75rem;flex:none}`,
  `.ttr-sp__app{display:inline-flex;align-items:center;gap:.5rem;min-width:0;color:var(--ttr-sp-muted);font-weight:500;font-size:.9375rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
  `.ttr-sp__app::before{content:"/";color:var(--ttr-sp-faint)}`,
  `.ttr-sp__app:hover{color:var(--ttr-sp-fg)}`,
  `.ttr-sp__header nav{display:flex;flex:none;align-items:center;gap:.25rem;margin-inline-end:-.75rem}`,
  `.ttr-sp__navlink{display:inline-flex;align-items:center;min-height:2.5rem;padding:0 .75rem;border-radius:.625rem;color:var(--ttr-sp-muted);font-size:.875rem;font-weight:500}`,
  `.ttr-sp__navlink:hover{color:var(--ttr-sp-fg);background:color-mix(in oklab,var(--ttr-sp-fg) 6%,transparent)}`,
  `.ttr-sp__main{flex:1;display:grid;place-items:center;width:100%;padding:3rem 1rem 4rem}`,
  `.ttr-sp__panel{width:100%;max-width:36rem}`,
  `.ttr-sp__code{margin:0;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:clamp(4.5rem,18vw,8rem);font-weight:700;line-height:1;letter-spacing:-.06em;color:var(--ttr-sp-faint);font-variant-numeric:tabular-nums}`,
  `.ttr-sp__title{margin:1.25rem 0 0;font-size:clamp(1.625rem,5vw,2.25rem);font-weight:650;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}`,
  `.ttr-sp__desc{margin:.75rem 0 0;max-width:32rem;color:var(--ttr-sp-muted);font-size:1rem;text-wrap:pretty}`,
  `.ttr-sp__actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:2rem}`,
  `.ttr-sp__btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:2.75rem;padding:0 1.125rem;border:1px solid var(--ttr-sp-border);border-radius:.75rem;background:var(--ttr-sp-surface);color:var(--ttr-sp-fg);font:inherit;font-size:.9375rem;font-weight:550;cursor:pointer;transition:border-color .15s,background-color .15s}`,
  `.ttr-sp__btn:hover{border-color:color-mix(in oklab,var(--ttr-sp-fg) 30%,var(--ttr-sp-border))}`,
  `.ttr-sp__btn[data-primary]{border-color:var(--ttr-sp-fg);background:var(--ttr-sp-fg);color:var(--ttr-sp-bg)}`,
  `.ttr-sp__btn[data-primary]:hover{opacity:.9}`,
  `.ttr-sp__btn svg{width:1rem;height:1rem;flex:none}`,
  `.ttr-sp__ref{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:1.5rem;color:var(--ttr-sp-muted);font-size:.875rem}`,
  `.ttr-sp__ref code,.ttr-sp__details pre{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:.8125rem;overflow-wrap:anywhere}`,
  `.ttr-sp__ref code{padding:.125rem .5rem;border:1px solid var(--ttr-sp-border);border-radius:.5rem;background:var(--ttr-sp-surface);color:var(--ttr-sp-fg)}`,
  `.ttr-sp__details{margin-top:1rem;color:var(--ttr-sp-muted);font-size:.875rem}`,
  `.ttr-sp__details pre{max-height:10rem;overflow:auto;white-space:pre-wrap}`,
  `.ttr-sp__footer{border-top:1px solid var(--ttr-sp-border);color:var(--ttr-sp-muted);font-size:.8125rem}`,
  `.ttr-sp__footer .ttr-sp__bar{flex-wrap:wrap;padding-block:1.25rem}`,
  `.ttr-sp__footer nav{display:flex;flex-wrap:wrap;gap:1rem}`,
  `.ttr-sp__footer a:hover{color:var(--ttr-sp-fg)}`,
  `@media (max-width:30rem){.ttr-sp__navlink[data-wide-only]{display:none}.ttr-sp__actions{display:grid;grid-template-columns:1fr}.ttr-sp__btn{width:100%}.ttr-sp__main{padding-top:2rem;place-items:start center}}`,
  `@media (prefers-reduced-motion:reduce){.ttr-sp__btn{transition:none}}`,
].join('\n');
