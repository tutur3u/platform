import GithubSlugger, { slug } from 'github-slugger';
import { z } from 'zod';
import { markdownTableCellAttrs } from './markdown-tables';
import type { RichTextNode } from './types';
import { isWikiAsset, parseWikiLink } from './urls';

export const MAX_WIKI_BODY_BYTES = 2_000_000;
export const MAX_WIKI_NODES = 50_000;
export const MAX_WIKI_DEPTH = 40;
export const wikiCalloutTones = [
  'note',
  'tip',
  'warning',
  'info',
  'check',
] as const;
const title = z.string().max(1000);
const positiveInt = (max: number) => z.number().int().min(1).max(max);
export const wikiHrefSchema = z
  .string()
  .max(2000)
  .refine(parseWikiLink, 'Unsupported wiki link');
export const wikiHeadingIdSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[\p{L}\p{M}\p{N}_-]+$/u);
const leaf = z.strictObject({});
const markSchemas = {
  bold: leaf,
  italic: leaf,
  strike: leaf,
  code: leaf,
  underline: leaf,
  subscript: leaf,
  superscript: leaf,
  highlight: leaf,
  link: z.strictObject({ href: wikiHrefSchema, title: title.optional() }),
};
const imageAttrs = z.strictObject({
  src: z
    .string()
    .refine(isWikiAsset, 'Expected a content-addressed wiki asset'),
  alt: title.optional(),
  title: title.optional(),
  width: positiveInt(4096).optional(),
  height: positiveInt(4096).optional(),
});
const attrsSchemas = {
  doc: leaf,
  paragraph: leaf,
  anchor: z.strictObject({ id: wikiHeadingIdSchema }),
  text: leaf,
  heading: z.strictObject({
    level: positiveInt(6),
    id: wikiHeadingIdSchema.optional(),
  }),
  bulletList: leaf,
  orderedList: z.strictObject({
    start: z.number().int().min(0).max(999_999_999).optional(),
  }),
  listItem: leaf,
  blockquote: leaf,
  hardBreak: leaf,
  horizontalRule: leaf,
  codeBlock: z.strictObject({
    language: z
      .string()
      .max(80)
      .regex(/^[\w.+#-]+$/)
      .optional(),
    title: title.optional(),
  }),
  table: leaf,
  tableRow: leaf,
  tableCell: markdownTableCellAttrs,
  tableHeader: markdownTableCellAttrs,
  taskList: leaf,
  taskItem: z.strictObject({ checked: z.boolean() }),
  details: leaf,
  detailsSummary: leaf,
  detailsContent: leaf,
  image: imageAttrs,
  imageResize: imageAttrs,
  callout: z.strictObject({ tone: z.enum(wikiCalloutTones) }),
  card: z.strictObject({
    title,
    href: wikiHrefSchema.optional(),
    icon: title.optional(),
    horizontal: z.boolean().optional(),
  }),
  cardGrid: z.strictObject({ cols: positiveInt(12).optional() }),
};
const requiredAttrs = new Set([
  'heading',
  'taskItem',
  'image',
  'imageResize',
  'callout',
  'card',
  'anchor',
]);
const inline = ['text', 'hardBreak', 'image', 'anchor'];
const blocks = [
  'paragraph',
  'heading',
  'blockquote',
  'horizontalRule',
  'codeBlock',
  'bulletList',
  'orderedList',
  'taskList',
  'table',
  'details',
  'callout',
  'card',
  'cardGrid',
  'image',
  'imageResize',
  'anchor',
];
const childTypes: Partial<
  Record<keyof typeof attrsSchemas, readonly string[]>
> = {
  doc: blocks,
  paragraph: inline,
  heading: inline,
  blockquote: blocks,
  codeBlock: ['text'],
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  taskList: ['taskItem'],
  listItem: blocks,
  taskItem: blocks,
  table: ['tableRow'],
  tableRow: ['tableHeader', 'tableCell'],
  tableCell: blocks,
  tableHeader: blocks,
  details: ['detailsSummary', 'detailsContent'],
  detailsSummary: inline,
  detailsContent: blocks,
  callout: blocks,
  card: blocks,
  cardGrid: ['card'],
};

const shallowNodeSchema = z.strictObject({
  type: z.enum(Object.keys(attrsSchemas) as (keyof typeof attrsSchemas)[]),
  attrs: z.record(z.string(), z.unknown()).optional(),
  text: z.string().min(1).max(MAX_WIKI_BODY_BYTES).optional(),
  marks: z
    .array(
      z.strictObject({
        type: z.enum(Object.keys(markSchemas) as (keyof typeof markSchemas)[]),
        attrs: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(10)
    .optional(),
  content: z.array(z.unknown()).max(MAX_WIKI_NODES).optional(),
});

function validateDocument(
  input: unknown,
  ctx: z.RefinementCtx
): RichTextNode | typeof z.NEVER {
  const root: RichTextNode[] = [];
  const stack = [
    {
      value: input,
      target: root,
      path: [] as (number | string)[],
      depth: 0,
      code: false,
    },
  ];
  const ids = new Set<string>();
  let count = 0;
  let bytes = 0;
  const encoder = new TextEncoder();
  function reject(path: (number | string)[], message: string) {
    ctx.addIssue({ code: 'custom', path, message });
    return z.NEVER;
  }

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const { value, target, path, depth, code } = current;
    if (++count > MAX_WIKI_NODES || depth > MAX_WIKI_DEPTH)
      return reject(path, 'Wiki body exceeds the node or depth limit');

    const parsed = shallowNodeSchema.safeParse(value);
    if (!parsed.success)
      return reject(
        path.concat(parsed.error.issues[0]?.path.map(String) ?? []),
        'Invalid wiki node or mark'
      );
    const { type, attrs, content = [], marks = [], text } = parsed.data;
    if (!depth && type !== 'doc')
      return reject(path, 'Expected a wiki document root');
    const cleanAttrs = attrsSchemas[type].safeParse(attrs ?? {});
    if ((!attrs && requiredAttrs.has(type)) || !cleanAttrs.success)
      return reject(
        [...path, 'attrs'],
        'Unsupported or missing node attributes'
      );

    if (
      (type === 'text') !== (text !== undefined) ||
      (marks.length && (type !== 'text' || code)) ||
      (type === 'codeBlock' && content.length > 1)
    )
      return reject(path, 'Unsupported text, marks or code structure');

    const id = type === 'heading' || type === 'anchor' ? attrs?.id : undefined;
    if (typeof id === 'string') {
      if (ids.has(id)) return reject(path, 'Duplicate anchor id');
      ids.add(id);
    }
    const seenMarks = new Set<string>();
    const cleanMarks: NonNullable<RichTextNode['marks']> = [];
    for (const mark of marks) {
      const markAttrs = markSchemas[mark.type].safeParse(mark.attrs ?? {});
      if (seenMarks.has(mark.type) || !markAttrs.success)
        return reject([...path, 'marks'], 'Unsupported or duplicate mark');
      seenMarks.add(mark.type);
      cleanMarks.push({
        type: mark.type,
        ...(mark.attrs && { attrs: markAttrs.data }),
      });
    }
    if (seenMarks.has('code') && marks.at(-1)?.type !== 'code')
      return reject(
        [...path, 'marks'],
        'Inline code must be the innermost mark'
      );
    const allowed = childTypes[type] ?? [];
    if (!allowed.length && parsed.data.content !== undefined)
      return reject(path, 'Leaf nodes cannot contain content');
    if (
      type === 'details' &&
      (content.length !== 2 ||
        nodeType(content[0]) !== 'detailsSummary' ||
        nodeType(content[1]) !== 'detailsContent')
    )
      return reject(path, 'Details requires a summary followed by its body');

    const cleanChildren: RichTextNode[] = [];
    const cleanNode: RichTextNode = {
      type,
      ...(Object.keys(cleanAttrs.data).length && { attrs: cleanAttrs.data }),
      ...(text !== undefined && { text }),
      ...(cleanMarks.length && { marks: cleanMarks }),
      ...(content.length && { content: cleanChildren }),
    };
    bytes += encoder.encode(JSON.stringify(cleanNode)).length;
    if (bytes > MAX_WIKI_BODY_BYTES)
      return reject(path, 'Wiki body exceeds the byte limit');
    target.push(cleanNode);
    for (let i = content.length - 1; i >= 0; i--) {
      const child = content[i];
      const childType = nodeType(child);
      if (typeof childType !== 'string' || !allowed.includes(childType))
        return reject([...path, 'content', i], 'Unsupported child node');
      stack.push({
        value: child,
        target: cleanChildren,
        path: [...path, 'content', i],
        depth: depth + 1,
        code: type === 'codeBlock',
      });
    }
  }

  const document = root[0];
  if (!document) return reject([], 'Expected a wiki document');
  const slugger = new GithubSlugger();
  function setIds(node: RichTextNode) {
    if (node.type === 'heading' && node.attrs && !node.attrs.id) {
      const label = (node.content ?? [])
        .map((child) => child.text ?? child.attrs?.alt ?? '')
        .join('');
      const candidate = slug(label)
        .slice(0, 500)
        .replace(/[\uD800-\uDBFF]$/u, '');
      const base = wikiHeadingIdSchema.safeParse(candidate).success
        ? candidate
        : 'section';
      let id = slugger.slug(base);
      while (ids.has(id)) id = slugger.slug(base);
      node.attrs.id = id;
      ids.add(id);
    }
    node.content?.forEach(setIds);
  }
  setIds(document);
  if (encoder.encode(JSON.stringify(document)).length > MAX_WIKI_BODY_BYTES)
    return reject([], 'Wiki body exceeds the byte limit');
  return document;
}

function nodeType(value: unknown): unknown {
  return value && typeof value === 'object' && 'type' in value
    ? value.type
    : undefined;
}

export const wikiDocumentSchema = z.unknown().transform(validateDocument);

export type WikiDocument = RichTextNode;
