import type { JSONContent } from './types.js';
import { normalizeRichTextImageUrl, normalizeRichTextUrl } from './url.js';

const textNode = (
  text: string,
  marks?: NonNullable<JSONContent['marks']>
): JSONContent => ({
  ...(marks?.length ? { marks } : {}),
  text,
  type: 'text',
});

const ESCAPE_SENTINEL = '\uE000';
const ESCAPED_MARKDOWN: Record<string, string> = {
  '\\': '0',
  '*': '1',
  _: '2',
  '[': '3',
  ']': '4',
  '~': '5',
  '`': '6',
  '-': '7',
  '+': '8',
  '.': '9',
  ')': 'A',
  '#': 'B',
  '>': 'C',
  '!': 'D',
  '(': 'E',
  '<': 'F',
};

const MARKDOWN_ESCAPES = new Map(
  Object.entries(ESCAPED_MARKDOWN).map(([character, token]) => [
    token,
    character,
  ])
);

function restoreMarkdownMetadata(value: string): string {
  return value.replace(/\\(["\\])/gu, '$1');
}

function restoreHTMLAttribute(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#10;', '\n')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function protectMarkdownEscapes(value: string): string {
  return value
    .replaceAll(ESCAPE_SENTINEL, `${ESCAPE_SENTINEL}L`)
    .replace(/\\([\\*_[\]~`\-+.()#!<>])/gu, (_, character: string) =>
      ESCAPED_MARKDOWN[character]
        ? `${ESCAPE_SENTINEL}${ESCAPED_MARKDOWN[character]}`
        : character
    );
}

function restoreMarkdownEscapes(value: string): string {
  let restored = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (character !== ESCAPE_SENTINEL) {
      restored += character;
      continue;
    }
    const code = value[index + 1];
    if (code === 'L') {
      restored += ESCAPE_SENTINEL;
      index += 1;
      continue;
    }
    const escaped = code ? MARKDOWN_ESCAPES.get(code) : null;
    if (escaped) {
      restored += escaped;
      index += 1;
      continue;
    }
    restored += character;
  }
  return restored;
}

type Mark = NonNullable<JSONContent['marks']>[number];

function addMark(nodes: JSONContent[], mark: Mark): JSONContent[] {
  return nodes.map((node) =>
    node.type === 'text'
      ? { ...node, marks: [...(node.marks ?? []), mark] }
      : { ...node, content: addMark(node.content ?? [], mark) }
  );
}

type InlineMatch = {
  index: number;
  length: number;
  nodes: JSONContent[];
};

type InlinePattern = {
  pattern: RegExp;
  render: (match: RegExpMatchArray) => JSONContent[];
};

const INLINE_PATTERNS: InlinePattern[] = [
  {
    pattern: /<span style="color:\s*([^"]+)">(.*?)<\/span>/u,
    render: (match) =>
      addMark(parseProtectedInline(match[2] ?? ''), {
        attrs: {
          color: restoreHTMLAttribute(restoreMarkdownEscapes(match[1] ?? '')),
        },
        type: 'textStyle',
      }),
  },
  {
    pattern: /<mark style="background-color:\s*([^"]+)">(.*?)<\/mark>/u,
    render: (match) =>
      addMark(parseProtectedInline(match[2] ?? ''), {
        attrs: {
          color: restoreHTMLAttribute(restoreMarkdownEscapes(match[1] ?? '')),
        },
        type: 'highlight',
      }),
  },
  {
    pattern: /<br\s*\/?>/u,
    render: () => [{ type: 'hardBreak' }],
  },
  {
    pattern: /\*\*\*([^*]+)\*\*\*/u,
    render: (match) =>
      addMark(addMark(parseProtectedInline(match[1] ?? ''), { type: 'bold' }), {
        type: 'italic',
      }),
  },
  {
    pattern: /<u>(.*?)<\/u>/u,
    render: (match) =>
      addMark(parseProtectedInline(match[1] ?? ''), { type: 'underline' }),
  },
  {
    pattern: /!\[([^\]]*)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)/u,
    render: (match) => {
      const src = normalizeRichTextImageUrl(
        restoreMarkdownEscapes(match[2] ?? '')
      );
      return src
        ? [
            {
              attrs: {
                alt: restoreMarkdownEscapes(match[1] ?? ''),
                src,
                ...(match[3]
                  ? {
                      title: restoreMarkdownMetadata(
                        restoreMarkdownEscapes(match[3])
                      ),
                    }
                  : {}),
              },
              type: 'image',
            },
          ]
        : [textNode(match[0])];
    },
  },
  {
    pattern: /\[([^\]]+)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)/u,
    render: (match) => {
      const href = normalizeRichTextUrl(restoreMarkdownEscapes(match[2] ?? ''));
      return href
        ? addMark(parseProtectedInline(match[1] ?? ''), {
            attrs: {
              href,
              ...(match[3]
                ? {
                    title: restoreMarkdownMetadata(
                      restoreMarkdownEscapes(match[3])
                    ),
                  }
                : {}),
            },
            type: 'link',
          })
        : [textNode(match[0])];
    },
  },
  {
    pattern: /\*\*([^*]+)\*\*/u,
    render: (match) =>
      addMark(parseProtectedInline(match[1] ?? ''), { type: 'bold' }),
  },
  {
    pattern: /__([^_]+)__/u,
    render: (match) =>
      addMark(parseProtectedInline(match[1] ?? ''), { type: 'bold' }),
  },
  {
    pattern: /~~([^~]+)~~/u,
    render: (match) =>
      addMark(parseProtectedInline(match[1] ?? ''), { type: 'strike' }),
  },
  {
    pattern: /(?:^|[^*])\*([^*\n]+)\*(?!\*)/u,
    render: (match) => {
      const prefix = match[0].startsWith('*') ? '' : match[0][0];
      return [
        ...(prefix ? [textNode(prefix)] : []),
        ...addMark(parseProtectedInline(match[1] ?? ''), {
          type: 'italic',
        }),
      ];
    },
  },
];

function findInlineMatch(value: string): InlineMatch | null {
  let winner:
    | {
        index: number;
        match: RegExpMatchArray;
        render: InlinePattern['render'];
      }
    | undefined;

  for (const { pattern, render } of INLINE_PATTERNS) {
    const match = value.match(pattern);
    if (match?.index === undefined) continue;
    if (
      !winner ||
      match.index < winner.index ||
      (match.index === winner.index && match[0].length > winner.match[0].length)
    )
      winner = { index: match.index, match, render };
  }

  return winner
    ? {
        index: winner.index,
        length: winner.match[0].length,
        nodes: winner.render(winner.match),
      }
    : null;
}

function parseProtectedInline(value: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let rest = value;

  while (rest) {
    const match = findInlineMatch(rest);
    if (!match) {
      nodes.push(textNode(restoreMarkdownEscapes(rest)));
      break;
    }
    if (match.index > 0)
      nodes.push(textNode(restoreMarkdownEscapes(rest.slice(0, match.index))));
    nodes.push(...match.nodes);
    rest = rest.slice(match.index + match.length);
  }

  return nodes;
}

function parseInline(value: string): JSONContent[] {
  return parseProtectedInline(protectMarkdownEscapes(value));
}

const paragraph = (value: string): JSONContent => ({
  content: parseInline(value),
  type: 'paragraph',
});

function parseHardBreakSequence({
  first,
  index,
  lines,
  readContinuation,
}: {
  first: string;
  index: number;
  lines: string[];
  readContinuation: (line: string) => string | null;
}) {
  const inline: JSONContent[] = [];
  let current = first;
  let nextIndex = index + 1;

  while (current.endsWith('  ') && nextIndex < lines.length) {
    const continuation = readContinuation(lines[nextIndex] ?? '');
    if (continuation === null) break;
    inline.push(...parseInline(current.slice(0, -2)));
    inline.push({ type: 'hardBreak' });
    current = continuation;
    nextIndex += 1;
  }

  inline.push(...parseInline(current));
  return { inline, nextIndex };
}

type MarkdownListType = 'bulletList' | 'orderedList';

function matchMarkdownListLine(line: string) {
  const bullet = /^(\s*)[-*+]\s+(.*)$/u.exec(line);
  if (bullet)
    return {
      indent: bullet[1]?.length ?? 0,
      type: 'bulletList' as const,
      value: bullet[2] ?? '',
    };

  const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/u.exec(line);
  if (ordered)
    return {
      indent: ordered[1]?.length ?? 0,
      start: Number(ordered[2] ?? 1),
      type: 'orderedList' as const,
      value: ordered[3] ?? '',
    };

  return null;
}

function parseMarkdownList(
  lines: string[],
  startIndex: number,
  type: MarkdownListType,
  indent: number
): { nextIndex: number; node: JSONContent } {
  const items: JSONContent[] = [];
  const firstMatch = matchMarkdownListLine(lines[startIndex] ?? '');
  let index = startIndex;

  while (index < lines.length) {
    const match = matchMarkdownListLine(lines[index] ?? '');
    if (!match || match.type !== type || match.indent !== indent) break;

    const continuationIndent = indent + (type === 'bulletList' ? 2 : 3);
    const inline: JSONContent[] = [];
    let current = match.value;
    index += 1;

    while (current.endsWith('  ') && index < lines.length) {
      const nextLine = lines[index] ?? '';
      const nestedList = matchMarkdownListLine(nextLine);
      if (nestedList && nestedList.indent > indent) {
        inline.push(...parseInline(current.slice(0, -2)));
        inline.push({ type: 'hardBreak' });
        current = '';
        break;
      }
      if (
        nextLine.slice(0, continuationIndent).trim() ||
        nextLine.length < continuationIndent
      )
        break;
      inline.push(...parseInline(current.slice(0, -2)));
      inline.push({ type: 'hardBreak' });
      current = nextLine.slice(continuationIndent);
      index += 1;
    }
    inline.push(...parseInline(current));

    const itemContent: JSONContent[] = [{ content: inline, type: 'paragraph' }];
    while (index < lines.length) {
      const nextLine = lines[index] ?? '';
      const nested = matchMarkdownListLine(nextLine);
      if (nested && nested.indent > indent) {
        const parsed = parseMarkdownList(
          lines,
          index,
          nested.type,
          nested.indent
        );
        itemContent.push(parsed.node);
        index = parsed.nextIndex;
        continue;
      }
      if (
        nextLine.length >= continuationIndent &&
        !nextLine.slice(0, continuationIndent).trim() &&
        nextLine.slice(continuationIndent).trim()
      ) {
        itemContent.push(paragraph(nextLine.slice(continuationIndent)));
        index += 1;
        continue;
      }
      break;
    }
    items.push({ content: itemContent, type: 'listItem' });
  }

  return {
    nextIndex: index,
    node: {
      ...(type === 'orderedList' &&
      firstMatch?.type === 'orderedList' &&
      firstMatch.start !== 1
        ? { attrs: { start: firstMatch.start } }
        : {}),
      content: items,
      type,
    },
  };
}

export function markdownToJSON(markdown: string): JSONContent {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const content: JSONContent[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const alignedBlock = line.match(
      /^<(p|h([1-4])) style="text-align:\s*(left|center|right)">(.*)<\/\1>$/u
    );
    if (alignedBlock) {
      content.push({
        attrs: alignedBlock[2]
          ? {
              level: Number(alignedBlock[2]),
              textAlign: alignedBlock[3],
            }
          : { textAlign: alignedBlock[3] },
        content: parseInline(alignedBlock[4] ?? ''),
        type: alignedBlock[2] ? 'heading' : 'paragraph',
      });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/u);
    if (heading) {
      content.push({
        attrs: { level: heading[1]?.length ?? 2 },
        content: parseInline(heading[2] ?? ''),
        type: 'heading',
      });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/u, ''));
        index += 1;
      }
      const quoted = markdownToJSON(quoteLines.join('\n')).content ?? [];
      content.push({ content: quoted, type: 'blockquote' });
      continue;
    }

    const list = matchMarkdownListLine(line);
    if (list) {
      const parsed = parseMarkdownList(lines, index, list.type, list.indent);
      content.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/u.test(line)) {
      content.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    const image = line.match(
      /^!\[((?:\\.|[^\]])*)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)$/u
    );
    const imageSrc = image
      ? normalizeRichTextImageUrl(image[2]?.replace(/\\([()])/gu, '$1'))
      : null;
    if (image && imageSrc) {
      content.push({
        attrs: {
          alt: restoreMarkdownEscapes(protectMarkdownEscapes(image[1] ?? '')),
          src: imageSrc,
          ...(image[3] ? { title: restoreMarkdownMetadata(image[3]) } : {}),
        },
        type: 'image',
      });
      index += 1;
      continue;
    }

    if (line.endsWith('  ') && index < lines.length - 1) {
      const sequence = parseHardBreakSequence({
        first: line,
        index,
        lines,
        readContinuation: (continuation) => continuation,
      });
      content.push({ content: sequence.inline, type: 'paragraph' });
      index = sequence.nextIndex;
      continue;
    }

    content.push(paragraph(line));
    index += 1;
  }

  return { content, type: 'doc' };
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]~<>])/gu, '\\$1');
}

function escapeMarkdownDestination(value: string): string {
  return value.replace(/([()])/gu, '\\$1');
}

function escapeMarkdownMetadata(value: string): string {
  return value.replace(/([\\"])/gu, '\\$1');
}

function escapeHTMLAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function textToMarkdown(node: JSONContent): string {
  let value = escapeMarkdownText(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') value = `**${value}**`;
    if (mark.type === 'italic') value = `*${value}*`;
    if (mark.type === 'underline') value = `<u>${value}</u>`;
    if (mark.type === 'strike') value = `~~${value}~~`;
    if (mark.type === 'textStyle' && typeof mark.attrs?.color === 'string')
      value = `<span style="color: ${escapeHTMLAttribute(mark.attrs.color)}">${value}</span>`;
    if (mark.type === 'highlight' && typeof mark.attrs?.color === 'string')
      value = `<mark style="background-color: ${escapeHTMLAttribute(mark.attrs.color)}">${value}</mark>`;
    if (mark.type === 'link') {
      const href = normalizeRichTextUrl(mark.attrs?.href);
      if (href) {
        const title =
          typeof mark.attrs?.title === 'string' && mark.attrs.title
            ? ` "${escapeMarkdownMetadata(mark.attrs.title)}"`
            : '';
        value = `[${value}](${escapeMarkdownDestination(href)}${title})`;
      }
    }
  }
  return value;
}

function nodeToMarkdown(node: JSONContent): string {
  if (node.type === 'text') return textToMarkdown(node);
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'image') {
    const src = normalizeRichTextImageUrl(node.attrs?.src);
    if (!src) return '';
    const alt = String(node.attrs?.alt ?? '').replace(/([\\\]])/gu, '\\$1');
    const title =
      typeof node.attrs?.title === 'string' && node.attrs.title
        ? ` "${escapeMarkdownMetadata(node.attrs.title)}"`
        : '';
    return `![${alt}](${escapeMarkdownDestination(src)}${title})`;
  }

  const children = (node.content ?? []).map(nodeToMarkdown).join('');
  if (node.type === 'heading') {
    const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 2)));
    const textAlign = String(node.attrs?.textAlign ?? '');
    if (['left', 'center', 'right'].includes(textAlign))
      return `<h${level} style="text-align: ${textAlign}">${children.replaceAll(
        '  \n',
        '<br>'
      )}</h${level}>`;
    return `${'#'.repeat(level)} ${children}`;
  }
  if (node.type === 'blockquote')
    return (node.content ?? [])
      .map(nodeToMarkdown)
      .join('\n')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  if (node.type === 'horizontalRule') return '---';
  if (node.type === 'paragraph') {
    const textAlign = String(node.attrs?.textAlign ?? '');
    if (['left', 'center', 'right'].includes(textAlign))
      return `<p style="text-align: ${textAlign}">${children.replaceAll(
        '  \n',
        '<br>'
      )}</p>`;
    return children
      .replace(/^(\s*)([-+*])(\s)/u, '$1\\$2$3')
      .replace(/^(\s*\d+)([.)])(\s)/u, '$1\\$2$3')
      .replace(/^(\s*)(#{1,4}|>)(\s)/u, '$1\\$2$3')
      .replace(/^(\s*)---+\s*$/u, '$1\\---')
      .replace(/^(\s*)!\[/u, '$1\\![');
  }
  if (node.type === 'bulletList')
    return (node.content ?? [])
      .map((item) =>
        nodeToMarkdown(item)
          .split('\n')
          .map((line, index) => `${index === 0 ? '- ' : '  '}${line}`)
          .join('\n')
      )
      .join('\n');
  if (node.type === 'orderedList')
    return (node.content ?? [])
      .map((item, index) =>
        nodeToMarkdown(item)
          .split('\n')
          .map(
            (line, lineIndex) =>
              `${
                lineIndex === 0
                  ? `${Number(node.attrs?.start ?? 1) + index}. `
                  : '   '
              }${line}`
          )
          .join('\n')
      )
      .join('\n');
  if (node.type === 'listItem')
    return (node.content ?? []).map(nodeToMarkdown).join('\n');
  return children;
}

export function jsonToMarkdown(content: JSONContent | null): string {
  return (content?.content ?? []).map(nodeToMarkdown).join('\n\n').trim();
}

export function extractPlainText(content: JSONContent | null): string {
  if (!content) return '';
  const parts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.text) parts.push(node.text);
    if (node.type === 'image' && node.attrs?.alt)
      parts.push(String(node.attrs.alt));
    for (const child of node.content ?? []) visit(child);
    if (
      ['paragraph', 'heading', 'listItem', 'blockquote'].includes(
        node.type ?? ''
      )
    )
      parts.push('\n');
  };
  visit(content);
  return parts
    .join('')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}
