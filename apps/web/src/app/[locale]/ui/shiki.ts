import 'server-only';
import type { Highlighter } from 'shiki';

/**
 * Server-side syntax highlighting for the UI docs code blocks. A single
 * highlighter instance is created lazily and reused across requests so we don't
 * pay the WASM/theme load cost per code block.
 */

const themes = { light: 'github-light', dark: 'github-dark' } as const;
const langs = ['tsx', 'ts', 'bash', 'json'] as const;

const pinnedClock = () => 0;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: Object.values(themes),
        langs: [...langs],
      })
    );
  }
  return highlighterPromise;
}

function escapeHtml(code: string) {
  return code
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plainCodeHtml(code: string) {
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

/**
 * Highlight `code` to dual-theme HTML. The output embeds both light and dark
 * colors as CSS variables (see `shiki.css`) so theme switching needs no JS.
 */
export async function highlightCode(code: string, lang = 'tsx') {
  if (process.env.NODE_ENV === 'development') {
    return plainCodeHtml(code);
  }

  const highlighter = await getHighlighter();
  const resolvedLang = (langs as readonly string[]).includes(lang)
    ? lang
    : 'tsx';

  // shiki's tokenizer reads the wall clock (Date.now / performance.now) only to
  // enforce a tokenization time limit. Next's static-prerender guard forbids
  // reading the current time inside a Server Component, so pin the clock to a
  // constant for the duration of the synchronous codeToHtml call. This keeps the
  // docs pages statically renderable (no force-dynamic) and is safe: codeToHtml
  // runs synchronously, so the globals are restored before any other code runs.
  const realDateNow = Date.now;
  const perf = globalThis.performance as { now: () => number } | undefined;
  const realPerfNow = perf?.now;
  Date.now = pinnedClock;
  if (perf) perf.now = pinnedClock;
  try {
    return highlighter.codeToHtml(code, {
      lang: resolvedLang,
      themes,
      defaultColor: false,
    });
  } finally {
    Date.now = realDateNow;
    if (perf && realPerfNow) perf.now = realPerfNow;
  }
}
