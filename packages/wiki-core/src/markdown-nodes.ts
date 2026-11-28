import type { Nodes } from 'mdast';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { WikiMarkdownError } from './markdown-format';
import type { RichTextNode } from './types';

export const cardItem = z.strictObject({
  title: z.string(),
  href: z.string().optional(),
  icon: z.string().optional(),
  horizontal: z.boolean().optional(),
  body: z.string().optional(),
});
export const cardsData = z.strictObject({
  cols: z.number().optional(),
  cards: z.array(cardItem).min(1).max(1000),
});

export type Attributes = Record<string, unknown>;

export const text = (value: string): RichTextNode => ({
  type: 'text',
  text: value,
});
export const paragraph = (value: string): RichTextNode => ({
  type: 'paragraph',
  ...(value && { content: [text(value)] }),
});

export function error(node: Nodes, message: string): never {
  throw new WikiMarkdownError(message, node.position?.start.line);
}

export function yaml(value: string, node: Nodes): unknown {
  try {
    const doc = parseDocument(value, { uniqueKeys: true });
    if (doc.errors.length || doc.warnings.length) throw new Error();
    return doc.toJS({ maxAliasCount: 0 });
  } catch {
    return error(node, 'Unsupported or invalid YAML');
  }
}

export function requiredString(
  attrs: Attributes,
  key: string,
  node: Nodes
): string {
  const value = attrs[key];
  if (typeof value !== 'string' || !value)
    return error(node, `Expected a ${key} attribute`);
  return value;
}

export function codeBlock(
  value: string,
  language?: string | null,
  title?: string
): RichTextNode {
  return {
    type: 'codeBlock',
    ...((language || title !== undefined) && {
      attrs: {
        ...(language && { language }),
        ...(title !== undefined && { title }),
      },
    }),
    ...(value && { content: [text(value)] }),
  };
}

export function details(title: string, content: RichTextNode[]): RichTextNode {
  return {
    type: 'details',
    content: [
      { type: 'detailsSummary', content: [text(title)] },
      { type: 'detailsContent', ...(content.length && { content }) },
    ],
  };
}
