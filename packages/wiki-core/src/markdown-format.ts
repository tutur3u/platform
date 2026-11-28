import type { Nodes, Root } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const base = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);
export const markdownParser = base().use(remarkDirective).freeze();
export const mdxParser = base().use(remarkMdx).freeze();
const writer = base()
  .use(remarkDirective)
  .use(remarkStringify, { fences: true, bullet: '-', listItemIndent: 'one' })
  .freeze();
export function stringifyMarkdown(tree: Root): string {
  return writer.stringify(tree);
}

export class WikiMarkdownError extends Error {
  readonly line: number;

  constructor(message: string, line = 1) {
    super(`Line ${line}: ${message}`);
    this.name = 'WikiMarkdownError';
    this.line = line;
  }
}

export function parseSource(
  source: string,
  format: 'markdown' | 'mdx' | undefined
): Root {
  try {
    const parser = format === 'mdx' ? mdxParser : markdownParser;
    const tree = parser.parse(source);
    if (format === 'mdx' || !source.includes(':::details ')) return tree;
    const edits: { start: number; end: number; value: string }[] = [];
    const stack: Nodes[] = [tree];
    while (stack.length) {
      const node = stack.pop()!;
      if (
        node.type === 'paragraph' &&
        node.position?.start.offset !== undefined
      ) {
        const start = node.position.start.offset;
        const match = /^(:{3,}details)[ \t]+([^\r\n]+)(?=\r?\n|$)/.exec(
          source.slice(start)
        );
        if (match) {
          const title = match[2]!
            .trim()
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;');
          edits.push({
            start,
            end: start + match[0].length,
            value: `${match[1]}{title="${title}"}`,
          });
        }
      }
      if ('children' in node) {
        for (const child of node.children) stack.push(child);
      }
    }
    if (!edits.length) return tree;
    const parts: string[] = [];
    let offset = 0;
    for (const { start, end, value } of edits.sort(
      (a, b) => a.start - b.start
    )) {
      parts.push(source.slice(offset, start), value);
      offset = end;
    }
    parts.push(source.slice(offset));
    return parser.parse(parts.join(''));
  } catch (cause) {
    const line =
      cause &&
      typeof cause === 'object' &&
      'line' in cause &&
      typeof cause.line === 'number'
        ? cause.line
        : 1;
    throw new WikiMarkdownError('Invalid Markdown or MDX syntax', line);
  }
}
