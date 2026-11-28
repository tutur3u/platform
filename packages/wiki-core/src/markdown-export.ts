import type {
  ListItem,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
} from 'mdast';
import { stringify as stringifyYaml } from 'yaml';
import { stringifyMarkdown, WikiMarkdownError } from './markdown-format';
import type { RichTextMark, RichTextNode } from './types';

function unsupported(message: string): never {
  throw new WikiMarkdownError(message);
}

function serializeBlock(nodes: RootContent[]): string {
  return stringifyMarkdown({ type: 'root', children: nodes });
}

const markTypes = {
  bold: 'strong',
  italic: 'emphasis',
  strike: 'delete',
} as const;

function marked(
  mark: RichTextMark,
  children: PhrasingContent[]
): PhrasingContent {
  if (mark.type === 'code') {
    if (children.length !== 1 || children[0]?.type !== 'text')
      return unsupported('Unsupported inline code');
    return { type: 'inlineCode', value: children[0].value };
  }
  if (mark.type === 'link') {
    const { href, title } = mark.attrs ?? {};
    return {
      type: 'link',
      url: String(href),
      ...(typeof title === 'string' && { title }),
      children,
    };
  }
  if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'strike')
    return { type: markTypes[mark.type], children };
  return { type: 'textDirective', name: mark.type, children };
}

function image(node: RichTextNode): PhrasingContent {
  const { src, alt, title, width, height } = node.attrs ?? {};
  if (width === undefined && height === undefined)
    return {
      type: 'image',
      url: String(src),
      alt: typeof alt === 'string' ? alt : '',
      title: typeof title === 'string' ? title : null,
    };
  return {
    type: 'textDirective',
    name: 'wiki-image',
    children: [],
    attributes: Object.fromEntries(
      Object.entries(node.attrs ?? {}).map(([key, value]) => [
        key,
        String(value),
      ])
    ),
  };
}

function anchor(node: RichTextNode): PhrasingContent {
  return {
    type: 'textDirective',
    name: 'wiki-anchor',
    attributes: { id: String(node.attrs?.id) },
    children: [],
  };
}

function phrasing(nodes: RichTextNode[], depth = 0): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const mark = node.marks?.[depth];
    if (mark) {
      const group = [node];
      while (
        i + 1 < nodes.length &&
        JSON.stringify(nodes[i + 1]?.marks?.[depth]) === JSON.stringify(mark)
      )
        group.push(nodes[++i]!);
      result.push(marked(mark, phrasing(group, depth + 1)));
    } else if (node.type === 'text')
      result.push({ type: 'text', value: node.text ?? '' });
    else if (node.type === 'hardBreak') result.push({ type: 'break' });
    else if (node.type === 'image') result.push(image(node));
    else if (node.type === 'anchor') result.push(anchor(node));
    else return unsupported('Unsupported inline node');
  }
  return result;
}

function tableCell(node: RichTextNode): TableCell {
  const cells = node.content ?? [];
  if (
    cells.length > 1 ||
    (cells.length && cells[0]?.type !== 'paragraph') ||
    node.attrs?.rowspan ||
    node.attrs?.colspan
  )
    return unsupported(
      'GFM tables require a single paragraph per cell and no spans'
    );
  return { type: 'tableCell', children: phrasing(cells[0]?.content ?? []) };
}

function table(node: RichTextNode): RootContent {
  const rows = node.content ?? [];
  const headers = rows[0]?.content ?? [];
  const align = headers.map((cell) => cell.attrs?.textAlign ?? null);
  const gfm =
    headers.length &&
    rows.every(
      (row, rowIndex) =>
        row.content?.length === headers.length &&
        row.content.every(
          (cell, column) =>
            cell.type === (rowIndex ? 'tableCell' : 'tableHeader') &&
            !cell.attrs?.colspan &&
            !cell.attrs?.rowspan &&
            (cell.attrs?.textAlign ?? null) === align[column] &&
            (!cell.content ||
              (cell.content.length === 1 &&
                cell.content[0]?.type === 'paragraph'))
        )
    );
  if (gfm) {
    return {
      type: 'table',
      align: align as ('left' | 'right' | 'center' | null)[],
      children: rows.map((row) => ({
        type: 'tableRow',
        children: (row.content ?? []).map(tableCell),
      })),
    };
  }
  const data = rows.map((row) =>
    (row.content ?? []).map((cell) => ({
      type: cell.type,
      ...(cell.attrs && { attrs: cell.attrs }),
      ...(cell.content?.length && {
        body: serializeBlock(blocks(cell.content)),
      }),
    }))
  );
  return {
    type: 'code',
    lang: 'wiki-table',
    value: stringifyYaml(data, { lineWidth: 0 }).trimEnd(),
  };
}

function cardFence(node: RichTextNode, single: boolean): RootContent {
  const cards = single ? [node] : (node.content ?? []);
  return {
    type: 'code',
    lang: 'cards',
    ...(single && { meta: 'single' }),
    value: stringifyYaml(
      {
        ...(!single &&
          node.attrs?.cols !== undefined && { cols: node.attrs.cols }),
        cards: cards.map((card) => ({
          ...card.attrs,
          ...(card.content?.length && {
            body: serializeBlock(blocks(card.content)),
          }),
        })),
      },
      { lineWidth: 0 }
    ).trimEnd(),
  };
}

function blocks(nodes: RichTextNode[]): RootContent[] {
  return nodes.map(block);
}

function block(node: RichTextNode): RootContent {
  const children = node.content ?? [];
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', children: phrasing(children) };
    case 'heading': {
      const anchor: PhrasingContent[] =
        typeof attrs.id === 'string'
          ? [
              {
                type: 'textDirective',
                name: 'anchor',
                attributes: { id: attrs.id },
                children: [],
              },
            ]
          : [];
      return {
        type: 'heading',
        depth: attrs.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: [...phrasing(children), ...anchor],
      };
    }
    case 'anchor':
      return {
        type: 'leafDirective',
        name: 'wiki-anchor',
        attributes: { id: String(attrs.id) },
        children: [],
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'codeBlock': {
      const { language, title } = attrs;
      const value = children[0]?.text ?? '';
      if (
        (!language && title !== undefined) ||
        ['cards', 'wiki-table', 'wiki-code'].includes(String(language))
      )
        return {
          type: 'code',
          lang: 'wiki-code',
          value,
          meta: JSON.stringify({ language, title }),
        };
      return {
        type: 'code',
        lang: typeof language === 'string' ? language : null,
        meta:
          typeof title === 'string' ? `title=${JSON.stringify(title)}` : null,
        value,
      };
    }
    case 'blockquote':
      return {
        type: 'blockquote',
        children: blocks(children) as Extract<
          Nodes,
          { type: 'blockquote' }
        >['children'],
      };
    case 'callout':
      return {
        type: 'blockquote',
        children: [
          { type: 'html', value: `[!${String(attrs.tone).toUpperCase()}]` },
          ...(blocks(children) as Extract<
            Nodes,
            { type: 'blockquote' }
          >['children']),
        ],
      };
    case 'taskList':
    case 'bulletList':
    case 'orderedList':
      return {
        type: 'list',
        ordered: node.type === 'orderedList',
        start: typeof attrs.start === 'number' ? attrs.start : null,
        children: children.map((item) => ({
          type: 'listItem',
          ...(typeof item.attrs?.checked === 'boolean' && {
            checked: item.attrs.checked,
          }),
          children: blocks(item.content ?? []) as ListItem['children'],
        })),
      };
    case 'table':
      return table(node);
    case 'details': {
      const summary = children[0]?.content ?? [];
      if (
        summary.length !== 1 ||
        summary[0]?.type !== 'text' ||
        summary[0].marks?.length
      )
        return unsupported('Details requires a plain-text title in Markdown');
      return {
        type: 'containerDirective',
        name: 'details',
        attributes: { title: summary[0].text ?? '' },
        children: blocks(children[1]?.content ?? []) as Extract<
          Nodes,
          { type: 'containerDirective' }
        >['children'],
      };
    }
    case 'card':
      return cardFence(node, true);
    case 'cardGrid':
      return cardFence(node, false);
    default:
      return unsupported('Unsupported Markdown block');
  }
}

export function exportMarkdown(
  body: RichTextNode,
  frontmatter: Record<string, unknown>
): string {
  const yaml: RootContent[] = Object.keys(frontmatter).length
    ? [
        {
          type: 'yaml',
          value: stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd(),
        },
      ]
    : [];
  const tree: Root = {
    type: 'root',
    children: [...yaml, ...blocks(body.content ?? [])],
  };
  return stringifyMarkdown(tree);
}
