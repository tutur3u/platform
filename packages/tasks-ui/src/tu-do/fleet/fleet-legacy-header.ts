/**
 * Reader for the legacy fleet:v1 description header. The Fleet view reads
 * first-class task fields first; this header is only a temporary fallback
 * for cards the board sync has not moved onto those fields yet.
 */
import type { FleetLink, FleetLinkType } from './fleet-task-meta';

const LINK_TYPES = new Set<string>([
  'pr',
  'commit',
  'thread',
  'issue',
  'doc',
  'run',
]);

/** Flattens a TipTap/ProseMirror JSON document to text; returns markdown as is. */
export function descriptionToText(description?: string | null): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (!trimmed.startsWith('{')) return description;
  try {
    const doc = JSON.parse(trimmed) as unknown;
    const lines: string[] = [];
    const walk = (node: unknown, line: string[]): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { type?: string; text?: string; content?: unknown[] };
      if (typeof n.text === 'string') line.push(n.text);
      if (n.type === 'hardBreak') line.push('\n');
      const isBlock =
        n.type === 'paragraph' ||
        n.type === 'heading' ||
        n.type === 'listItem' ||
        n.type === 'codeBlock';
      if (isBlock) {
        const inner: string[] = [];
        for (const child of n.content ?? []) walk(child, inner);
        lines.push(...inner.join('').split('\n'));
        return;
      }
      for (const child of n.content ?? []) walk(child, line);
    };
    const top: string[] = [];
    walk(doc, top);
    if (top.length) lines.push(top.join(''));
    return lines.join('\n');
  } catch {
    return description;
  }
}

function extractBlock(text: string): string[] | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) =>
    /^\s*(<!--\s*)?fleet:v1\s*(-->)?\s*$/.test(l)
  );
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*(<!--\s*)?\/fleet:v1\s*(-->)?\s*$/.test(line)) break;
    if (/^\s*##\s/.test(line)) break;
    body.push(line);
  }
  return body;
}

export function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Only an http(s) URL written in the data becomes a link; nothing is built
 * from ids, and every other scheme stays plain text.
 */
export function toSafeHref(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseLink(raw: string): FleetLink | null {
  const text = raw.replace(/^\s*-\s*/, '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    return { type: 'link', value: text, href: toSafeHref(text) };
  }
  const m = text.match(/^([a-z]+)\s*:\s*(.+)$/i);
  if (!m) return null;
  const key = m[1]!.toLowerCase();
  const value = m[2]!.trim();
  const type = LINK_TYPES.has(key) ? (key as FleetLinkType) : 'link';
  return { type, value, href: toSafeHref(value) };
}

export interface LegacyFleetHeader {
  present: boolean;
  fields: Record<string, string>;
  links: FleetLink[];
}

/** Reads the `<!-- fleet:v1 -->` block, if any, from a task description. */
export function readLegacyFleetHeader(
  description?: string | null
): LegacyFleetHeader {
  const fields: Record<string, string> = {};
  const links: FleetLink[] = [];
  const block = extractBlock(descriptionToText(description));
  if (!block) return { present: false, fields, links };
  let inLinks = false;
  for (const line of block) {
    const kv = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (kv && !/^\s*-/.test(line)) {
      const key = kv[1]!.toLowerCase();
      inLinks = key === 'links';
      if (inLinks) {
        const inline = parseLink(kv[2] ?? '');
        if (inline) links.push(inline);
      } else fields[key] = kv[2] ?? '';
    } else if (inLinks && /^\s*-/.test(line)) {
      const link = parseLink(line);
      if (link) links.push(link);
    }
  }
  return { present: true, fields, links };
}
