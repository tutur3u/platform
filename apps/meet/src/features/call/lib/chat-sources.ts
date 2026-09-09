import remarkParse from 'remark-parse';
import { unified } from 'unified';

export interface ChatSource {
  url: string;
  title: string;
}

/** Inspect the same Markdown structure that the renderer sees, including HTML. */
function isLiteralFooter(body: string, offset: number) {
  type PositionedNode = {
    type: string;
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: PositionedNode[];
  };
  const contains = (node: PositionedNode): boolean =>
    (['code', 'html'].includes(node.type) &&
      (node.position?.start.offset ?? Infinity) <= offset &&
      offset < (node.position?.end.offset ?? -1)) ||
    (node.children?.some(contains) ?? false);
  return contains(unified().use(remarkParse).parse(body));
}

/** Older Mira messages store provider sources as a final list of Markdown links. */
export function splitChatSources(body: string) {
  const lines = body.trimEnd().split('\n');
  const sources: ChatSource[] = [];
  let end = lines.length;
  while (end > 0) {
    const match = lines[end - 1]?.match(
      /^- \[([^\]\n]+)\]\(<(https?:\/\/[^<>\s]+)>\)$/
    );
    if (!match) break;
    try {
      const url = new URL(match[2]!);
      if (!['https:', 'http:'].includes(url.protocol)) break;
      sources.unshift({ title: match[1]!, url: match[2]! });
    } catch {
      break;
    }
    end--;
  }
  // Require the separate footer emitted by the server, not a list inside a paragraph/code.
  if (
    !sources.length ||
    end === 0 ||
    lines[end - 1]?.trim() ||
    isLiteralFooter(body, lines.slice(0, end).join('\n').length + 1)
  )
    return { text: body, sources: [] as ChatSource[] };
  return {
    text: lines.slice(0, end).join('\n').trimEnd(),
    sources: [
      ...new Map(sources.map((source) => [source.url, source])).values(),
    ],
  };
}

type Node = {
  type: string;
  value?: string;
  url?: string;
  title?: string;
  children?: Node[];
};
export const UNRESOLVED_CITATION =
  'https://meet.tuturuuu.com/#unresolved-citation';
/** Provider-looking legacy IDs have no saved mapping. Do not invent an attribution. */
export function remarkUnresolvedCitations() {
  return (tree: Node) => {
    const visit = (node: Node) => {
      if (
        ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(
          node.type
        ) ||
        !node.children
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const parts: Node[] = [];
        let end = 0;
        for (const match of child.value.matchAll(/\[([A-Za-z0-9_-]{16})\]/g)) {
          if (
            !/[a-z]/.test(match[1]!) ||
            !/[A-Z]/.test(match[1]!) ||
            !/\d/.test(match[1]!)
          )
            continue;
          parts.push(
            { type: 'text', value: child.value.slice(end, match.index) },
            {
              type: 'link',
              url: UNRESOLVED_CITATION,
              children: [{ type: 'text', value: '?' }],
            }
          );
          end = match.index + match[0].length;
        }
        return end
          ? [...parts, { type: 'text', value: child.value.slice(end) }]
          : [child];
      });
    };
    visit(tree);
  };
}
