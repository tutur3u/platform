import type { ReactNode } from 'react';

type MarkdownBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { items: string[]; kind: 'list'; ordered: boolean }
  | { kind: 'quote'; lines: string[] }
  | { head: string[]; kind: 'table'; rows: string[][] };

const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
const isTableSeparator = (line: string) =>
  /^\|(\s*:?-+:?\s*\|)+$/u.test(line.trim());

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlinePattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while (true) {
    match = inlinePattern.exec(text);
    if (!match) {
      break;
    }

    const [token] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (token.startsWith('**')) {
      nodes.push(
        <strong
          className="font-semibold"
          key={`${keyPrefix}-strong-${nodes.length}`}
        >
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);

      if (linkMatch) {
        const label = linkMatch[1] ?? '';
        const href = linkMatch[2] ?? '#';
        const isExternal = /^https?:\/\//u.test(href);

        nodes.push(
          <a
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            href={href}
            key={`${keyPrefix}-link-${nodes.length}`}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            target={isExternal ? '_blank' : undefined}
          >
            {label}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderInlineLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const lineNodes = renderInline(line, `${keyPrefix}-line-${index}`);

    if (index === lines.length - 1) {
      return lineNodes;
    }

    return [...lineNodes, <br key={`${keyPrefix}-br-${index}`} />];
  });
}

function parseLegalMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let currentList: { items: string[]; ordered: boolean } | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({ kind: 'paragraph', lines: [...paragraphLines] });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!currentList) {
      return;
    }

    blocks.push({
      kind: 'list',
      ordered: currentList.ordered,
      items: [...currentList.items],
    });
    currentList = null;
  };

  const lines = markdown.trim().split(/\r?\n/u);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trimEnd();
    const trimmed = line.trim();

    // GitHub-style table: a header row, a separator row, then body rows.
    if (trimmed.startsWith('|') && isTableSeparator(lines[index + 1] ?? '')) {
      flushParagraph();
      flushList();
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.trim().startsWith('|'))
        rows.push(tableCells(lines[index++]!));
      index--;
      blocks.push({ kind: 'table', head: tableCells(trimmed), rows });
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'quote',
        lines: [trimmed.replace(/^>\s?/u, '')],
      });
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/u);
    const unorderedMatch = line.match(/^\s*\*\s+(.*)$/u);
    const listMatch = orderedMatch ?? unorderedMatch;

    if (listMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);

      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { ordered, items: [] };
      }

      currentList.items.push(listMatch[1] ?? '');
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export function LegalMarkdown({ children }: { children: string }) {
  return parseLegalMarkdown(children).map((block, index) => {
    const keyPrefix = `legal-md-${index}`;

    if (block.kind === 'paragraph') {
      return <p key={keyPrefix}>{renderInlineLines(block.lines, keyPrefix)}</p>;
    }

    if (block.kind === 'quote') {
      return (
        <blockquote
          className="border-primary/25 text-muted-foreground"
          key={keyPrefix}
        >
          {renderInlineLines(block.lines, keyPrefix)}
        </blockquote>
      );
    }

    if (block.kind === 'table') {
      return (
        <div className="overflow-x-auto" key={keyPrefix}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, cellIndex) => (
                  <th key={`${keyPrefix}-head-${cellIndex}`} scope="col">
                    {renderInline(cell, `${keyPrefix}-head-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${keyPrefix}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${keyPrefix}-cell-${rowIndex}-${cellIndex}`}>
                      {renderInline(
                        cell,
                        `${keyPrefix}-cell-${rowIndex}-${cellIndex}`
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const ListTag = block.ordered ? 'ol' : 'ul';

    return (
      <ListTag key={keyPrefix}>
        {block.items.map((item, itemIndex) => (
          <li key={`${keyPrefix}-item-${itemIndex}`}>
            {renderInline(item, `${keyPrefix}-item-${itemIndex}`)}
          </li>
        ))}
      </ListTag>
    );
  });
}
