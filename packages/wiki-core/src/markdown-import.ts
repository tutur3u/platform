import GithubSlugger from 'github-slugger';
import type { Nodes, PhrasingContent, Root } from 'mdast';
import { z } from 'zod';
import { parseSource, WikiMarkdownError } from './markdown-format';
import { convertMdx, staticSource } from './markdown-mdx';
import {
  type Attributes,
  type cardItem,
  cardsData,
  codeBlock,
  details,
  error,
  requiredString,
  text,
  yaml,
} from './markdown-nodes';
import { markdownTableData } from './markdown-tables';
import {
  MAX_WIKI_BODY_BYTES,
  MAX_WIKI_DEPTH,
  MAX_WIKI_NODES,
  wikiCalloutTones,
  wikiDocumentSchema,
} from './schema';
import type { RichTextMark, RichTextNode } from './types';
import { isWikiAsset, isWikiHost, parseWikiLink } from './urls';

export type WikiMarkdownOptions = {
  format?: 'markdown' | 'mdx';
  resolveLink?: (href: string) => string | undefined;
  resolveAsset?: (src: string) => string | undefined;
  /** Enable for reviewed source files containing approved live demo examples. */
  staticDemos?: boolean;
};

const wikiFrontmatterSchema = z.record(z.string(), z.unknown());
function fenceTitle(
  node: Extract<Nodes, { type: 'code' }>
): string | undefined {
  if (!node.meta) return;
  if (!node.meta.startsWith('title=')) return node.meta;
  try {
    const title: unknown = JSON.parse(node.meta.slice('title='.length));
    if (typeof title === 'string') return title;
  } catch {}
  return error(node, 'Expected a quoted code title');
}

export function parseWikiMarkdown(
  source: string,
  options: WikiMarkdownOptions = {}
) {
  if (new TextEncoder().encode(source).length > MAX_WIKI_BODY_BYTES)
    throw new WikiMarkdownError('Markdown exceeds the byte limit');
  const tree = parseSource(source, options.format);
  const header = tree.children[0];
  const frontmatter =
    header?.type === 'yaml'
      ? wikiFrontmatterSchema.safeParse(yaml(header.value, header))
      : undefined;
  if (header?.type === 'yaml') tree.children.shift();
  if (frontmatter && !frontmatter.success)
    return error(tree, 'Expected a frontmatter mapping');

  const slugger = new GithubSlugger();
  type Definition = Extract<Nodes, { type: 'definition' }>;
  let definitions = new Map<string, Definition>();
  function visitAst(root: Root, scope: Map<string, Definition>) {
    const visited = [root as Nodes];
    while (visited.length) {
      const node = visited.pop()!;
      if (++astNodes > MAX_WIKI_NODES)
        return error(node, 'Markdown exceeds the node limit');
      if (node.type === 'definition' && !scope.has(node.identifier))
        scope.set(node.identifier, node);
      if ('children' in node)
        for (let i = node.children.length - 1; i >= 0; i--)
          visited.push(node.children[i]!);
    }
  }
  let astNodes = 0;
  visitAst(tree, definitions);

  function embeddedBlocks(markdown: string, depth: number) {
    const nested = parseSource(markdown, 'markdown');
    const previous = definitions;
    definitions = new Map();
    try {
      visitAst(nested, definitions);
      return children(nested.children, depth);
    } finally {
      definitions = previous;
    }
  }

  function link(value: string, node: Nodes): string {
    // Canonical Markdown keeps its own wiki URLs. The import caller resolves
    // legacy docs routes against the inventory (including redirects).
    let local = false;
    const safe = parseWikiLink(value);
    if (options.format === 'mdx' && /^https?:\/\//i.test(value)) {
      try {
        const hostname = new URL(value).hostname.replace(/\.$/, '');
        local =
          hostname === 'docs.tuturuuu.com' || (!safe && isWikiHost(hostname));
      } catch {}
    }
    const relative =
      !safe && !/^(?:\/\/|#|[a-z][a-z0-9+.-]*:)|[\\\x00-\x20\x7f]/i.test(value);
    const resolved =
      local || relative ? options.resolveLink?.(value) : safe && value;
    if (!resolved || !parseWikiLink(resolved))
      return error(node, 'Unsupported or unresolved link');
    return resolved;
  }

  function image(value: string, attrs: Attributes, node: Nodes): RichTextNode {
    const src = isWikiAsset(value) ? value : options.resolveAsset?.(value);
    if (!src || !isWikiAsset(src))
      return error(node, 'Unsupported or unresolved wiki asset');
    return { type: 'image', attrs: { ...attrs, src } };
  }

  function children(nodes: Nodes[], depth: number): RichTextNode[] {
    return nodes.flatMap((node) => convert(node, depth + 1));
  }

  function phrasing(
    nodes: PhrasingContent[],
    depth: number,
    marks: RichTextMark[] = []
  ): RichTextNode[] {
    const result: RichTextNode[] = [];
    for (const node of nodes) {
      const converted = convert(node, depth + 1, marks);
      for (const child of converted) {
        const prev = result.at(-1);
        if (
          prev?.type === 'text' &&
          child.type === 'text' &&
          JSON.stringify(prev.marks) === JSON.stringify(child.marks)
        )
          prev.text = (prev.text ?? '') + child.text;
        else result.push(child);
      }
    }
    return result;
  }

  function card(
    data: z.infer<typeof cardItem>,
    content: RichTextNode[],
    node: Nodes
  ): RichTextNode {
    const { href, body: _body, ...attrs } = data;
    return {
      type: 'card',
      attrs: {
        ...attrs,
        ...(href !== undefined && { href: link(href, node) }),
      },
      ...(content.length && { content }),
    };
  }

  const lines = new WeakMap<RichTextNode, number>();
  function convert(
    node: Nodes,
    depth: number,
    marks: RichTextMark[] = []
  ): RichTextNode[] {
    const converted = convertNode(node, depth, marks);
    for (const entry of converted) {
      if (!lines.has(entry) && node.position)
        lines.set(entry, node.position.start.line);
    }
    return converted;
  }

  function convertNode(
    node: Nodes,
    depth: number,
    marks: RichTextMark[]
  ): RichTextNode[] {
    if (depth > MAX_WIKI_DEPTH)
      return error(node, 'Markdown exceeds the depth limit');
    const markedText = (value: string, stack = marks) =>
      value ? [{ ...text(value), ...(stack.length && { marks: stack }) }] : [];
    const phrased = (
      type: string,
      nodes: PhrasingContent[],
      attrs?: Attributes
    ) => {
      const content = phrasing(nodes, depth, marks);
      return [
        { type, ...(attrs && { attrs }), ...(content.length && { content }) },
      ];
    };
    switch (node.type) {
      case 'text':
        return markedText(node.value.replace(/\r?\n/g, ' '));
      case 'inlineCode':
        return markedText(node.value, [...marks, { type: 'code' }]);
      case 'strong':
      case 'emphasis':
      case 'delete':
        return phrasing(node.children, depth, [
          ...marks,
          {
            type: { strong: 'bold', emphasis: 'italic', delete: 'strike' }[
              node.type
            ],
          },
        ]);
      case 'link':
      case 'linkReference': {
        const target =
          node.type === 'link' ? node : definitions.get(node.identifier);
        if (!target) return error(node, 'Unresolved link reference');
        const attrs = {
          href: link(target.url, node),
          ...(target.title != null && { title: target.title }),
        };
        return phrasing(node.children, depth, [
          ...marks,
          { type: 'link', attrs },
        ]);
      }
      case 'image':
      case 'imageReference': {
        const target =
          node.type === 'image' ? node : definitions.get(node.identifier);
        if (!target) return error(node, 'Unresolved image reference');
        if (marks.length) return error(node, 'Marked images are unsupported');
        return [
          image(
            target.url,
            {
              ...(node.alt && { alt: node.alt }),
              ...(target.title != null && { title: target.title }),
            },
            node
          ),
        ];
      }
      case 'paragraph': {
        const result: RichTextNode[] = [];
        let inline: RichTextNode[] = [];
        for (const child of phrasing(node.children, depth)) {
          if (['text', 'hardBreak', 'image', 'anchor'].includes(child.type)) {
            inline.push(child);
          } else {
            if (inline.length)
              result.push({ type: 'paragraph', content: inline });
            inline = [];
            result.push(child);
          }
        }
        if (inline.length) result.push({ type: 'paragraph', content: inline });
        return result;
      }
      case 'heading': {
        const parts = [...node.children];
        const anchor = parts.at(-1);
        let id: string | undefined;
        if (anchor?.type === 'textDirective' && anchor.name === 'anchor') {
          id = requiredString(anchor.attributes ?? {}, 'id', anchor);
          if (
            anchor.children.length ||
            Object.keys(anchor.attributes ?? {}).length !== 1
          )
            return error(anchor, 'Invalid heading anchor');
          parts.pop();
        }
        const content = phrasing(parts, depth);
        const computedId = slugger.slug(
          content.map((part) => part.text ?? part.attrs?.alt ?? '').join('')
        );
        id ??= computedId || slugger.slug('section');
        return [
          {
            type: 'heading',
            attrs: { level: node.depth, id },
            ...(content.length && { content }),
          },
        ];
      }
      case 'thematicBreak':
        return [{ type: 'horizontalRule' }];
      case 'break':
        return [{ type: 'hardBreak' }];
      case 'definition':
        return [];
      case 'blockquote': {
        const first = node.children[0];
        if (first?.type === 'paragraph' && first.children[0]?.type === 'text') {
          const start = first.children[0].value;
          const marker = /^\[!([A-Z]+)\](?:\n|$)/.exec(start);
          if (marker) {
            const tone = wikiCalloutTones.find(
              (tone) => tone === marker[1]?.toLowerCase()
            );
            if (!tone) return error(node, 'Unsupported callout tone');
            const remaining = first.children.slice(1);
            if (start.length > marker[0].length)
              remaining.unshift({
                type: 'text',
                value: start.slice(marker[0].length),
              });
            const body = remaining.length
              ? [{ ...first, children: remaining }, ...node.children.slice(1)]
              : node.children.slice(1);
            const content = children(body, depth);
            return [
              {
                type: 'callout',
                attrs: { tone },
                ...(content.length && { content }),
              },
            ];
          }
        }
        return [
          { type: 'blockquote', content: children(node.children, depth) },
        ];
      }
      case 'list': {
        const tasks = node.children.some((item) => item.checked != null);
        if (
          tasks &&
          (node.ordered || node.children.some((item) => item.checked == null))
        )
          return error(node, 'Mixed and ordered task lists are unsupported');
        return [
          {
            type: tasks
              ? 'taskList'
              : node.ordered
                ? 'orderedList'
                : 'bulletList',
            ...(node.ordered &&
              node.start !== 1 &&
              node.start != null && { attrs: { start: node.start } }),
            content: node.children.map((item) => ({
              type: tasks ? 'taskItem' : 'listItem',
              ...(tasks && { attrs: { checked: item.checked } }),
              content: children(item.children, depth + 1),
            })),
          },
        ];
      }
      case 'table':
        return [
          {
            type: 'table',
            content: node.children.map((row, index) => ({
              type: 'tableRow',
              content: row.children.map((cell, column) => {
                const alignment = node.align?.[column];
                const p = phrased('paragraph', cell.children)[0]!;
                return {
                  type: index ? 'tableCell' : 'tableHeader',
                  ...(alignment && { attrs: { textAlign: alignment } }),
                  ...(p.content?.length && { content: [p] }),
                };
              }),
            })),
          },
        ];
      case 'code': {
        if (node.lang === 'wiki-code') {
          let metadata: unknown;
          try {
            metadata = JSON.parse(node.meta ?? '');
          } catch {}
          const parsed = z
            .strictObject({
              language: z.string().optional(),
              title: z.string().optional(),
            })
            .safeParse(metadata);
          if (!parsed.success) return error(node, 'Invalid wiki-code metadata');
          return [
            codeBlock(node.value, parsed.data.language, parsed.data.title),
          ];
        }
        if (node.lang === 'wiki-table') {
          if (node.meta) return error(node, 'Unsupported wiki-table metadata');
          const parsed = markdownTableData.safeParse(yaml(node.value, node));
          if (!parsed.success) return error(node, 'Invalid wiki-table YAML');
          return [
            {
              type: 'table',
              content: parsed.data.map((row) => ({
                type: 'tableRow',
                content: row.map(({ type, attrs, body }) => ({
                  type,
                  ...(attrs && { attrs }),
                  ...(body && { content: embeddedBlocks(body, depth + 2) }),
                })),
              })),
            },
          ];
        }
        if (node.lang !== 'cards')
          return [codeBlock(node.value, node.lang, fenceTitle(node))];
        if (node.meta && node.meta !== 'single')
          return error(node, 'Unsupported cards metadata');
        const parsed = cardsData.safeParse(yaml(node.value, node));
        if (!parsed.success) return error(node, 'Invalid cards YAML');
        const cards = parsed.data.cards.map((data) =>
          card(
            data,
            data.body === undefined ? [] : embeddedBlocks(data.body, depth + 1),
            node
          )
        );
        if (node.meta === 'single') {
          if (cards.length !== 1 || parsed.data.cols !== undefined)
            return error(node, 'Expected one standalone card');
          return cards;
        }
        return [
          {
            type: 'cardGrid',
            ...(parsed.data.cols !== undefined && {
              attrs: { cols: parsed.data.cols },
            }),
            content: cards,
          },
        ];
      }
      case 'containerDirective':
        if (
          node.name === 'details' &&
          Object.keys(node.attributes ?? {}).length === 1
        )
          return [
            details(
              requiredString(node.attributes ?? {}, 'title', node),
              children(node.children, depth)
            ),
          ];
        return error(node, 'Unsupported block directive');
      case 'leafDirective':
        if (
          node.name === 'wiki-anchor' &&
          !node.children.length &&
          Object.keys(node.attributes ?? {}).length === 1
        )
          return [
            {
              type: 'anchor',
              attrs: { id: requiredString(node.attributes ?? {}, 'id', node) },
            },
          ];
        return error(node, 'Unsupported leaf directive');
      case 'textDirective':
        if (
          ['underline', 'highlight', 'subscript', 'superscript'].includes(
            node.name
          ) &&
          !Object.keys(node.attributes ?? {}).length
        )
          return phrasing(node.children, depth, [
            ...marks,
            { type: node.name },
          ]);
        if (node.name === 'wiki-image' && !node.children.length) {
          const { src: _src, width, height, ...attrs } = node.attributes ?? {};
          return [
            image(
              requiredString(node.attributes ?? {}, 'src', node),
              {
                ...attrs,
                ...(width !== undefined && { width: Number(width) }),
                ...(height !== undefined && { height: Number(height) }),
              },
              node
            ),
          ];
        }
        if (
          node.name === 'wiki-anchor' &&
          !node.children.length &&
          Object.keys(node.attributes ?? {}).length === 1
        )
          return [
            {
              type: 'anchor',
              attrs: { id: requiredString(node.attributes ?? {}, 'id', node) },
            },
          ];
        if (
          !node.children.length &&
          !Object.keys(node.attributes ?? {}).length &&
          (node.position?.end.offset ?? 0) -
            (node.position?.start.offset ?? 0) ===
            node.name.length + 1
        )
          return markedText(`:${node.name}`);
        return error(node, 'Unsupported inline directive');
      case 'mdxFlowExpression':
      case 'mdxTextExpression': {
        const program = node.data?.estree;
        // MDX exposes comments as empty ESTree programs. They carry no page content.
        if (
          program?.body.length === 0 &&
          /^\s*\/\*[\s\S]*?\*\/\s*$/.test(node.value)
        )
          return [];
        return error(node, 'Executable MDX is unsupported');
      }
      case 'mdxJsxFlowElement':
      case 'mdxJsxTextElement':
        if (marks.length)
          return error(node, 'Marked MDX components are unsupported');
        return convertMdx(node, {
          source,
          staticDemos: options.staticDemos,
          children: (nodes) => children(nodes, depth),
          phrasing: (nodes) => phrasing(nodes, depth),
          card,
          image,
        });
      case 'mdxjsEsm':
        if (options.staticDemos) return staticSource(node, source);
        return error(node, 'Executable MDX is unsupported');
      default:
        return error(node, 'Unsupported Markdown construct');
    }
  }

  const content = children(tree.children, 0);
  const result = wikiDocumentSchema.safeParse({
    type: 'doc',
    ...(content.length && { content }),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    let line: number | undefined;
    let node: RichTextNode | undefined = { type: 'doc', content };
    const path = issue?.path ?? [];
    for (let i = 0; i < path.length && node && path[i] === 'content'; i += 2) {
      node = node.content?.[Number(path[i + 1])];
      if (node) line = lines.get(node) ?? line;
    }
    throw new WikiMarkdownError(
      issue?.message ?? 'Invalid wiki document',
      line
    );
  }
  return { body: result.data, frontmatter: frontmatter?.data ?? {} };
}
