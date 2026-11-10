/**
 * Inline <script> text of an HTML document, found by walking real tags.
 *
 * A regex over the whole document also matches `<script>…</script>` that
 * appears inside attribute values (React escapes `"` and `&` there but not
 * `<` or `>`), comments or raw-text elements, and would hash attacker data
 * into script-src. This tokenizer follows the HTML tokenizer's states for
 * what SSR emits: tags with quoted/unquoted attributes, comments, doctype /
 * processing instructions, end tags, and raw-text / RCDATA elements whose
 * content is never markup. Only the text of an actual `script` element with
 * no `src` attribute is returned.
 *
 * Pure and dependency-free, for the Node pre-seal doctor. The Worker
 * (src/csp.ts) collects scripts with the runtime's HTMLRewriter instead, so
 * the doctor is an independent parser checking the live policy, and
 * src/csp.test.ts asserts the two agree on the same documents.
 */

/** Elements whose content is text until their own end tag. */
const RAW_TEXT = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);

const NAME_END = /[\s/>]/;
const ASCII_ALPHA = /[A-Za-z]/;

/** ASCII-only lowercase: keeps length, so indices stay aligned. */
function lower(text: string) {
  return text.replace(/[A-Z]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 32)
  );
}

/** Start of the end tag `</name …>` at or after `from`, and the index past it. */
function findEndTag(
  html: string,
  haystack: string,
  name: string,
  from: number
) {
  let at = from;
  for (;;) {
    const open = haystack.indexOf(`</${name}`, at);
    if (open === -1) return { start: -1, end: -1 };
    const after = html[open + 2 + name.length];
    if (after === undefined || NAME_END.test(after)) {
      const close = html.indexOf('>', open);
      return { start: open, end: close === -1 ? html.length : close + 1 };
    }
    at = open + 2;
  }
}

type Tag = { name: string; attributes: Set<string>; end: number };

/** Parse a start tag at `<` (html[start] === '<', followed by a letter). */
function readStartTag(html: string, start: number): Tag {
  let i = start + 1;
  let name = '';
  while (i < html.length && !NAME_END.test(html[i] as string))
    name += html[i++];
  const attributes = new Set<string>();
  while (i < html.length) {
    const c = html[i] as string;
    if (c === '>') return { name: lower(name), attributes, end: i + 1 };
    if (/\s|\//.test(c)) {
      i += 1;
      continue;
    }
    let attr = '';
    while (i < html.length && !/[\s/>=]/.test(html[i] as string))
      attr += html[i++];
    while (i < html.length && /\s/.test(html[i] as string)) i += 1;
    if (attr) attributes.add(lower(attr));
    if (html[i] !== '=') continue;
    i += 1;
    while (i < html.length && /\s/.test(html[i] as string)) i += 1;
    const quote = html[i];
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, i + 1);
      i = close === -1 ? html.length : close + 1;
    } else {
      while (i < html.length && !/[\s>]/.test(html[i] as string)) i += 1;
    }
  }
  return { name: lower(name), attributes, end: html.length };
}

export function inlineScriptTexts(html: string): string[] {
  const scripts: string[] = [];
  const haystack = lower(html);
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }
    const next = html[lt + 1] ?? '';
    if (next === '!' || next === '?' || next === '/') {
      // Doctype, processing instruction or a stray end tag.
      const close = html.indexOf('>', lt + 1);
      i = close === -1 ? html.length : close + 1;
      continue;
    }
    if (!ASCII_ALPHA.test(next)) {
      // A bare `<` in text is just text.
      i = lt + 1;
      continue;
    }
    const tag = readStartTag(html, lt);
    i = tag.end;
    if (!RAW_TEXT.has(tag.name)) continue;
    const { start, end } = findEndTag(html, haystack, tag.name, i);
    const text = html.slice(i, start === -1 ? html.length : start);
    if (tag.name === 'script' && !tag.attributes.has('src') && text.length)
      scripts.push(text);
    i = end === -1 ? html.length : end;
  }
  return scripts;
}
