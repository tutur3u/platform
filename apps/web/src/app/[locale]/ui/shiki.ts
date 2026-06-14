import 'server-only';
import { createHighlighter, type Highlighter } from 'shiki';

/**
 * Server-side syntax highlighting for the UI docs code blocks. A single
 * highlighter instance is created lazily and reused across requests so we don't
 * pay the WASM/theme load cost per code block.
 */

const themes = { light: 'github-light', dark: 'github-dark' } as const;
const langs = ['tsx', 'ts', 'bash', 'json'] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: Object.values(themes),
      langs: [...langs],
    });
  }
  return highlighterPromise;
}

/**
 * Highlight `code` to dual-theme HTML. The output embeds both light and dark
 * colors as CSS variables (see `shiki.css`) so theme switching needs no JS.
 */
export async function highlightCode(code: string, lang = 'tsx') {
  const highlighter = await getHighlighter();
  const resolvedLang = (langs as readonly string[]).includes(lang)
    ? lang
    : 'tsx';

  return highlighter.codeToHtml(code, {
    lang: resolvedLang,
    themes,
    defaultColor: false,
  });
}
