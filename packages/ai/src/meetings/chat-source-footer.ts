import remarkParse from 'remark-parse';
import { unified } from 'unified';
import {
  type MeetCitationSource,
  resolveMeetCitations,
} from './chat-citations';

const FOOTER_LIMIT = 4000;
const MESSAGE_LIMIT = 16000;
const sourceLine = (source: MeetCitationSource) =>
  `- [${(source.title || new URL(source.url).hostname).replace(/[[\]\r\n]/gu, ' ').slice(0, 120)}](<${source.url.replace(/[<>\s]/gu, encodeURIComponent)}>)`;

/** Preserve duplicate IDs for the same URL, but bound distinct serialized sources. */
export function selectMeetSources(sources: MeetCitationSource[]) {
  const selected: MeetCitationSource[] = [];
  const retained = new Map<string, MeetCitationSource>();
  let size = 0;
  for (const source of sources) {
    try {
      if (!['http:', 'https:'].includes(new URL(source.url).protocol)) continue;
    } catch {
      continue;
    }
    const existing = retained.get(source.url);
    if (existing) {
      selected.push({ ...existing, id: source.id });
      continue;
    }
    const normalized = {
      ...source,
      title: (source.title || new URL(source.url).hostname)
        .replace(/[[\]\r\n]/gu, ' ')
        .slice(0, 120),
    };
    const length = sourceLine(normalized).length + 1;
    if (retained.size >= 8 || size + length > FOOTER_LIMIT) continue;
    size += length;
    retained.set(source.url, normalized);
    selected.push(normalized);
  }
  return selected;
}

/** Reserve space for complete source links before the server's message-size guard. */
export function formatMeetSourceAnswer(
  text: string,
  sources: MeetCitationSource[]
) {
  const selected = selectMeetSources(sources);
  const footer = [
    ...new Map(selected.map((source) => [source.url, source])).values(),
  ]
    .map(sourceLine)
    .join('\n');
  let body = resolveMeetCitations(text, selected);
  const budget = MESSAGE_LIMIT - footer.length - 2;
  if (body.length > budget) {
    // Stop at a complete Markdown block so truncation cannot leave a partial link/fence.
    const tree = unified().use(remarkParse).parse(body);
    const end =
      tree.children
        .filter((node) => (node.position?.end.offset ?? Infinity) <= budget - 2)
        .at(-1)?.position?.end.offset ?? 0;
    if (end) {
      body = `${body.slice(0, end).trimEnd()}\n…`;
    } else {
      // A single long block still deserves a useful preview. Render its prefix
      // as escaped plain text, reserving room for worst-case Markdown escaping.
      const plain = (node: {
        type?: string;
        value?: string;
        children?: unknown[];
      }): string =>
        node.value ??
        node.children
          ?.map((child) => plain(child as Parameters<typeof plain>[0]))
          .join(' ') ??
        '';
      let prefix = plain(tree.children[0] ?? {}).slice(
        0,
        Math.floor((budget - 2) / 2)
      );
      const boundary = prefix.search(/\s+\S*$/u);
      if (boundary > 0) prefix = prefix.slice(0, boundary);
      body = `${prefix.trim().replace(/[\\`*_{}[\]()#+.!|><~&-]/gu, '\\$&')}\n…`;
    }
  }
  return footer ? `${body}\n\n${footer}` : body;
}
