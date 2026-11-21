import 'server-only';
import type { HighlighterCore } from 'shiki/core';

/**
 * Server-side syntax highlighting for the UI docs code blocks. A single
 * highlighter instance is created lazily and reused across requests so we don't
 * pay the grammar/theme load cost per code block.
 *
 * Use the JavaScript regex engine, never the default Oniguruma engine:
 * Cloudflare Workers forbid runtime WebAssembly compilation, so `shiki`'s
 * default `onig.wasm` load throws "Wasm code generation disallowed by
 * embedder" and fails every docs render in production.
 */

const themes = { light: 'github-light', dark: 'github-dark' } as const;
const langs = ['tsx', 'ts', 'bash', 'json'] as const;

const pinnedClock = () => 0;

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function createDocsHighlighter() {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
    await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);
  return createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ],
    langs: [
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/json.mjs'),
    ],
  });
}

function getHighlighter() {
  if (!highlighterPromise) {
    // Drop a failed load so a transient error is retried on a later request
    // instead of poisoning every render for the isolate's lifetime.
    highlighterPromise = createDocsHighlighter().catch((error: unknown) => {
      highlighterPromise = null;
      throw error;
    });
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

  let highlighter: HighlighterCore;
  try {
    highlighter = await getHighlighter();
  } catch (error) {
    console.error('[ui-docs] syntax highlighter unavailable', error);
    return plainCodeHtml(code);
  }
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
