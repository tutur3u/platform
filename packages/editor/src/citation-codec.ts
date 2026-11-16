import type { JSONContent } from './types.js';

export const MAX_CITATION_BYTES = 64 * 1024;
const MAX_DEPTH = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedJSON(
  value: unknown,
  depth = 0,
  budget = { remaining: 16000 }
): boolean {
  if (depth > MAX_DEPTH || --budget.remaining < 0) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return value.every((entry) => isBoundedJSON(entry, depth + 1, budget));
  return (
    isRecord(value) &&
    Object.values(value).every((entry) =>
      isBoundedJSON(entry, depth + 1, budget)
    )
  );
}

/** Opaque works, including unknown versions, survive without domain imports. */
export function boundedCitationAttrs(
  value: unknown
): Record<string, unknown> | null {
  try {
    if (!isRecord(value) || !isBoundedJSON(value)) return null;
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > MAX_CITATION_BYTES)
      return null;
    const decoded: unknown = JSON.parse(serialized);
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function citationFallbackText(
  attrs: Record<string, unknown> | undefined
): string {
  const snapshot = attrs?.snapshot;
  if (!isRecord(snapshot)) return '(citation)';
  const source = isRecord(snapshot.work) ? snapshot.work : snapshot.fields;
  const title = isRecord(source) ? source.title : null;
  return typeof title === 'string' && title.trim()
    ? `(${title.trim().slice(0, 2000)})`
    : '(citation)';
}

export function sanitizeCitationNode(node: JSONContent): JSONContent | null {
  if (node.type === 'citationBibliography') {
    return {
      type: node.type,
      attrs: { style: node.attrs?.style === 'harvard' ? 'harvard' : 'apa' },
    };
  }
  if (node.type !== 'citation') return null;
  // An invalid oversized payload retains a visible citation atom for recovery.
  return {
    type: 'citation',
    attrs: boundedCitationAttrs(node.attrs) ?? { snapshot: null },
  };
}

/** Unsupported containers may flatten blocks; retain their bibliography atoms. */
export function preserveCitationBibliographies(
  original: JSONContent,
  sanitized: JSONContent
): JSONContent {
  const collect = (node: JSONContent): JSONContent[] => [
    ...(node.type === 'citationBibliography' ? [node] : []),
    ...(node.content ?? []).flatMap(collect),
  ];
  const remaining = collect(sanitized);
  const missing = collect(original)
    .filter((node) => {
      const style = node.attrs?.style === 'harvard' ? 'harvard' : 'apa';
      const index = remaining.findIndex(
        (entry) => entry.attrs?.style === style
      );
      if (index < 0) return true;
      remaining.splice(index, 1);
      return false;
    })
    .flatMap((node) => {
      const safe = sanitizeCitationNode(node);
      return safe ? [safe] : [];
    });
  return missing.length
    ? { ...sanitized, content: [...(sanitized.content ?? []), ...missing] }
    : sanitized;
}

function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character
  );
}

function decodeHTML(value: string): string {
  return value.replace(
    /&(?:quot|apos|lt|gt|amp|#39|#10);/gu,
    (entity) =>
      ({
        '&quot;': '"',
        '&apos;': "'",
        '&#39;': "'",
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&#10;': '\n',
      })[entity] ?? entity
  );
}

export function renderCitationHTML(node: JSONContent): string | null {
  const safe = sanitizeCitationNode(node);
  if (!safe) return null;
  if (safe.type === 'citationBibliography') {
    return `<section data-citation-bibliography="" data-style="${safe.attrs?.style}"></section>`;
  }
  return `<cite data-citation="${escapeHTML(JSON.stringify(safe.attrs))}">${escapeHTML(citationFallbackText(safe.attrs))}</cite>`;
}

/** Reads only inert citation HTML emitted by the portable renderer or editor. */
export function parseCitationHTML(html: string): JSONContent | null {
  const bibliography = html.match(
    /^<section\b[^>]*\bdata-citation-bibliography(?:="[^"]*")?[^>]*>[\s\S]*<\/section>$/u
  );
  if (bibliography) {
    return sanitizeCitationNode({
      type: 'citationBibliography',
      attrs: { style: html.match(/\bdata-style="([^"]*)"/u)?.[1] },
    });
  }
  const match = html.match(
    /^<cite\s+data-citation="([^"]*)"[^>]*>[\s\S]*<\/cite>$/u
  );
  if (!match?.[1] || match[1].length > MAX_CITATION_BYTES * 6) return null;
  try {
    const attrs = boundedCitationAttrs(JSON.parse(decodeHTML(match[1])));
    return attrs ? { type: 'citation', attrs } : null;
  } catch {
    return null;
  }
}

export function extractPlainText(content: JSONContent | null): string {
  if (!content) return '';
  const parts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === 'citation') parts.push(citationFallbackText(node.attrs));
    else if (node.type === 'citationBibliography')
      parts.push('\n(references)\n');
    else if (node.text) parts.push(node.text);
    if (node.type === 'image' && node.attrs?.alt)
      parts.push(String(node.attrs.alt));
    for (const child of node.content ?? []) visit(child);
    if (
      [
        'paragraph',
        'heading',
        'listItem',
        'blockquote',
        'collapsibleSummary',
      ].includes(node.type ?? '')
    )
      parts.push('\n');
  };
  visit(content);
  return parts
    .join('')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}

/** Keep opaque JSON escapes outside Markdown's escape processing. */
export function parseCitationInline(
  value: string,
  parseText: (text: string) => JSONContent[]
): JSONContent[] {
  const nodes: JSONContent[] = [];
  let offset = 0;
  for (const match of value.matchAll(
    /<cite\s+data-citation="[^"]*"[^>]*>[\s\S]*?<\/cite>/gu
  )) {
    nodes.push(...parseText(value.slice(offset, match.index)));
    const citation = parseCitationHTML(match[0]);
    nodes.push(...(citation ? [citation] : parseText(match[0])));
    offset = match.index + match[0].length;
  }
  nodes.push(...parseText(value.slice(offset)));
  return nodes;
}
