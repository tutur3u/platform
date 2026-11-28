import type { Nodes, PhrasingContent } from 'mdast';
import type { z } from 'zod';
import {
  type Attributes,
  cardItem,
  codeBlock,
  details,
  error,
  paragraph,
  requiredString,
} from './markdown-nodes';
import { wikiCalloutTones } from './schema';
import type { RichTextNode } from './types';

type MdxElement = Extract<
  Nodes,
  { type: 'mdxJsxFlowElement' | 'mdxJsxTextElement' }
>;

const liveDemos = new Set([
  'Counter',
  'LoginToggle',
  'TailwindPlayground',
  'MiniTaskManager',
  'LiveCard',
]);
const literalAttributes = {
  Card: ['title', 'href', 'icon', 'horizontal'],
  CardGroup: ['cols'],
  Accordion: ['title'],
  Step: ['title'],
  Tab: ['title'],
  ParamField: [
    'path',
    'query',
    'body',
    'header',
    'name',
    'type',
    'required',
    'default',
  ],
  ResponseField: ['name', 'type', 'required', 'default'],
  Endpoint: ['method', 'path', 'url'],
  img: ['src', 'alt', 'title', 'width', 'height', 'className'],
  a: ['id'],
  Frame: ['caption'],
  div: ['className', 'align'],
  span: ['className'],
} as Record<string, readonly string[]>;

function mdxAttrs(node: MdxElement): Attributes {
  const allowed = literalAttributes[node.name ?? ''] ?? [];
  const attrs: Attributes = Object.create(null);
  for (const attribute of node.attributes) {
    if (
      attribute.type !== 'mdxJsxAttribute' ||
      !allowed.includes(attribute.name) ||
      attribute.name in attrs
    )
      return error(node, 'Unsupported or duplicate MDX attribute');
    const { name, value } = attribute;
    if (value === null) attrs[name] = true;
    else if (value && typeof value === 'object') {
      const literal = value.value.trim();
      if (/^\d+(?:\.\d+)?$/.test(literal)) attrs[name] = Number(literal);
      else if (literal === 'true' || literal === 'false')
        attrs[name] = literal === 'true';
      else
        return error(
          node,
          'Expected a static string, number or boolean attribute'
        );
    } else attrs[name] = value;
  }
  return attrs;
}

export function staticSource(node: Nodes, source: string): RichTextNode[] {
  const { start, end } = node.position ?? {};
  if (start?.offset === undefined || end?.offset === undefined)
    return error(node, 'Demo source position is unavailable');
  return [
    {
      type: 'callout',
      attrs: { tone: 'note' },
      content: [paragraph('Interactive demo source')],
    },
    codeBlock(source.slice(start.offset, end.offset), 'tsx'),
  ];
}

type MdxContext = {
  source: string;
  staticDemos?: boolean;
  children: (nodes: Nodes[]) => RichTextNode[];
  phrasing: (nodes: PhrasingContent[]) => RichTextNode[];
  card: (
    data: z.infer<typeof cardItem>,
    content: RichTextNode[],
    node: Nodes
  ) => RichTextNode;
  image: (value: string, attrs: Attributes, node: Nodes) => RichTextNode;
};

export function convertMdx(
  node: MdxElement,
  context: MdxContext
): RichTextNode[] {
  const { children, phrasing, card, image } = context;
  const name = node.name ?? '';
  if (
    context.staticDemos &&
    node.type === 'mdxJsxFlowElement' &&
    liveDemos.has(name)
  )
    return staticSource(node, context.source);
  const supported = [
    'Info',
    'Note',
    'Warning',
    'Tip',
    'Check',
    'Card',
    'CardGroup',
    'Accordion',
    'AccordionGroup',
    'Steps',
    'Step',
    'CodeGroup',
    'Tabs',
    'Tab',
    'ParamField',
    'ResponseField',
    'Endpoint',
    'img',
    'Frame',
    'div',
    'span',
    'br',
    'a',
  ];
  if (!supported.includes(name))
    return error(node, 'Unsupported MDX component');
  const attrs = mdxAttrs(node);
  const blockChildren = () =>
    node.type === 'mdxJsxTextElement'
      ? [{ type: 'paragraph', content: phrasing(node.children) }]
      : children(node.children);
  const tone = wikiCalloutTones.find((tone) => tone === name.toLowerCase());
  if (tone)
    return [{ type: 'callout', attrs: { tone }, content: blockChildren() }];
  if (name === 'Card') {
    const parsed = cardItem.safeParse(attrs);
    if (!parsed.success) return error(node, 'Invalid card attributes');
    return [card(parsed.data, blockChildren(), node)];
  }
  if (name === 'CardGroup') {
    const cols = attrs.cols === undefined ? undefined : Number(attrs.cols);
    return [
      {
        type: 'cardGrid',
        ...(cols !== undefined && { attrs: { cols } }),
        content: blockChildren(),
      },
    ];
  }
  if (name === 'Accordion')
    return [details(requiredString(attrs, 'title', node), blockChildren())];
  if (name === 'AccordionGroup') return blockChildren();
  if (name === 'Steps') {
    const items = blockChildren();
    if (items.some((item) => item.type !== 'listItem'))
      return error(node, 'Steps requires Step children');
    return [{ type: 'orderedList', content: items }];
  }
  if (name === 'Step') {
    const label = {
      type: 'text',
      text: requiredString(attrs, 'title', node),
      marks: [{ type: 'bold' }],
    };
    return [
      {
        type: 'listItem',
        content: [{ type: 'paragraph', content: [label] }, ...blockChildren()],
      },
    ];
  }
  if (name === 'CodeGroup' || name === 'Tabs') {
    const code = blockChildren();
    if (code.some((child) => child.type !== 'codeBlock'))
      return error(node, 'Expected code-only group content');
    return code;
  }
  if (name === 'Tab') {
    const code = blockChildren();
    const title = requiredString(attrs, 'title', node);
    return code.map((child) => {
      if (child.type !== 'codeBlock' || child.attrs?.title !== undefined)
        return error(node, 'Expected untitled code inside Tab');
      return { ...child, attrs: { ...child.attrs, title } };
    });
  }
  if (name === 'ParamField' || name === 'ResponseField') {
    const keys = ['name', 'path', 'query', 'body', 'header'];
    const key = keys.find((key) => typeof attrs[key] === 'string');
    if (!key) return error(node, 'Expected a field name');
    if (keys.filter((candidate) => candidate in attrs).length !== 1)
      return error(node, 'Expected exactly one field name');
    const field = requiredString(attrs, key, node);
    const cell = (
      type: string,
      content: RichTextNode[] = []
    ): RichTextNode => ({ type, ...(content.length && { content }) });
    const headers = ['Name', 'Type', 'Required', 'Default', 'Description'];
    const values = [
      key === 'name' ? field : `${key}: ${field}`,
      String(attrs.type ?? ''),
      attrs.required ? 'Yes' : 'No',
      String(attrs.default ?? ''),
    ];
    return [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: headers.map((label) =>
              cell('tableHeader', [paragraph(label)])
            ),
          },
          {
            type: 'tableRow',
            content: [
              ...values.map((value) =>
                cell('tableCell', value ? [paragraph(value)] : [])
              ),
              cell('tableCell', blockChildren()),
            ],
          },
        ],
      },
    ];
  }
  if (name === 'Endpoint') {
    if ('path' in attrs === 'url' in attrs)
      return error(node, 'Expected exactly one endpoint URL');
    const address = requiredString(
      attrs,
      'url' in attrs ? 'url' : 'path',
      node
    );
    return [
      codeBlock(`${requiredString(attrs, 'method', node)} ${address}`, 'http'),
      ...blockChildren(),
    ];
  }
  if (name === 'a') {
    if (node.children.length)
      return error(node, 'A static anchor cannot contain content');
    return [
      { type: 'anchor', attrs: { id: requiredString(attrs, 'id', node) } },
    ];
  }
  if (name === 'img') {
    const {
      src: _src,
      className: _className,
      width,
      height,
      ...strings
    } = attrs;
    const dimensions = {
      ...(width !== undefined && { width: Number(width) }),
      ...(height !== undefined && { height: Number(height) }),
    };
    const nodeImage = image(
      requiredString(attrs, 'src', node),
      { ...strings, ...dimensions },
      node
    );
    return node.type === 'mdxJsxFlowElement'
      ? [{ type: 'paragraph', content: [nodeImage] }]
      : [nodeImage];
  }
  if (name === 'br')
    return node.type === 'mdxJsxFlowElement'
      ? [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }]
      : [{ type: 'hardBreak' }];
  if (name === 'Frame')
    return [
      ...blockChildren(),
      ...(attrs.caption === undefined
        ? []
        : [paragraph(requiredString(attrs, 'caption', node))]),
    ];
  return node.type === 'mdxJsxTextElement'
    ? phrasing(node.children)
    : blockChildren();
}
