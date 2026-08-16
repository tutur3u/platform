import type { JSONContent } from './types.js';

type ParseDocument = (markdown: string) => JSONContent;
type ParseInline = (value: string) => JSONContent[];

function parseSummaryInline(
  value: string,
  parseInline: ParseInline
): JSONContent[] {
  const lines = value.split('\n');
  const content: JSONContent[] = [];

  lines.forEach((line, index) => {
    const hardBreak = line.endsWith('  ');
    content.push(...parseInline(hardBreak ? line.slice(0, -2) : line));
    if (index >= lines.length - 1) return;
    content.push(
      hardBreak ? { type: 'hardBreak' } : { text: ' ', type: 'text' }
    );
  });

  return content;
}

export function parseCollapsibleBlock({
  index,
  lines,
  paragraph,
  parseDocument,
  parseInline,
}: {
  index: number;
  lines: string[];
  paragraph: (value: string) => JSONContent;
  parseDocument: ParseDocument;
  parseInline: ParseInline;
}): { nextIndex: number; node: JSONContent } | null {
  if (!/^<details(?:\s+open)?\s*>$/u.test((lines[index] ?? '').trim()))
    return null;

  const detailLines: string[] = [];
  let cursor = index + 1;
  let detailsDepth = 1;
  while (cursor < lines.length && detailsDepth > 0) {
    const detailLine = lines[cursor] ?? '';
    if (/^<details(?:\s+open)?\s*>$/u.test(detailLine.trim())) {
      detailsDepth += 1;
      detailLines.push(detailLine);
    } else if (/^<\/details>\s*$/u.test(detailLine.trim())) {
      detailsDepth -= 1;
      if (detailsDepth > 0) detailLines.push(detailLine);
    } else {
      detailLines.push(detailLine);
    }
    cursor += 1;
  }

  const summaryStartIndex = detailLines.findIndex((item) =>
    item.trimStart().startsWith('<summary>')
  );
  const summaryEndIndex =
    summaryStartIndex >= 0
      ? detailLines.findIndex(
          (item, detailIndex) =>
            detailIndex >= summaryStartIndex && item.includes('</summary>')
        )
      : -1;
  const summarySource =
    summaryStartIndex >= 0 && summaryEndIndex >= summaryStartIndex
      ? detailLines
          .slice(summaryStartIndex, summaryEndIndex + 1)
          .join('\n')
          .trim()
      : '';
  const summaryMatch = /^<summary>([\s\S]*)<\/summary>\s*$/u.exec(
    summarySource
  );
  if (!summaryMatch || detailsDepth !== 0) return null;

  const body = detailLines
    .filter(
      (_, detailIndex) =>
        detailIndex < summaryStartIndex || detailIndex > summaryEndIndex
    )
    .join('\n')
    .trim();
  const bodyContent = parseDocument(body).content ?? [];

  return {
    nextIndex: cursor,
    node: {
      content: [
        {
          content: parseSummaryInline(summaryMatch[1] ?? '', parseInline),
          type: 'collapsibleSummary',
        },
        ...(bodyContent.length ? bodyContent : [paragraph('')]),
      ],
      type: 'collapsible',
    },
  };
}

export function collapsibleToMarkdown(
  node: JSONContent,
  serializeNode: (node: JSONContent) => string
): string {
  const [summary, ...body] = node.content ?? [];
  const summaryMarkdown = (summary?.content ?? []).map(serializeNode).join('');
  const bodyMarkdown = body.map(serializeNode).join('\n\n');
  return `<details>\n<summary>${summaryMarkdown}</summary>\n\n${bodyMarkdown}\n\n</details>`;
}
