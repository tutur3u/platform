import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type MeetCitationSource = {
  id?: string;
  sourceType: 'url';
  url: string;
  title?: string;
};

/** Resolve only exact provider IDs. Never infer a source for an unknown reference. */
export function resolveMeetCitations(
  text: string,
  sources: MeetCitationSource[]
) {
  const byId = new Map(
    sources.filter((source) => source.id).map((source) => [source.id, source])
  );
  const urls = [...new Set(sources.map((source) => source.url))];
  const edits: Array<{ start: number; end: number; text: string }> = [];
  type Node = {
    type: string;
    children?: Node[];
    position?: { start: { offset?: number }; end: { offset?: number } };
  };
  const visit = (node: Node) => {
    if (
      [
        'code',
        'inlineCode',
        'link',
        'linkReference',
        'image',
        'imageReference',
        'definition',
        'html',
      ].includes(node.type)
    )
      return;
    if (node.type === 'text') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      const originalText = text.slice(start, end);
      const replaced = originalText.replace(
        /\[([A-Za-z0-9_-]+)\](?!\()/g,
        (original, id: string) => {
          const source = byId.get(id);
          if (!source) return original;
          try {
            if (!['http:', 'https:'].includes(new URL(source.url).protocol))
              return original;
          } catch {
            return original;
          }
          return `[${urls.indexOf(source.url) + 1}](<${source.url.replace(/[<>\s]/g, encodeURIComponent)}>)`;
        }
      );
      if (replaced !== originalText) edits.push({ start, end, text: replaced });
    }
    node.children?.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(text));
  // Apply from the end to retain all original Markdown formatting and offsets.
  for (const edit of edits.reverse()) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}
