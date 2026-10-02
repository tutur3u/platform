import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { z } from 'zod';

export const safeLink = (value: string) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      ? !!url.hostname
      : url.protocol === 'mailto:' && !!url.pathname && !/[\r\n]/.test(value);
  } catch {
    return false;
  }
};
export const safeImage = (value: string) => {
  if (/^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const image = z
  .string()
  .max(2000)
  .refine(safeImage)
  .transform((value) => {
    if (!value.startsWith('https://')) return value;
    const url = new URL(value);
    return url.origin === 'https://lettin.tuturuuu.com' &&
      /^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/.test(url.pathname)
      ? url.pathname
      : value;
  });
const attrs = z.object({
  level: z.number().int().min(1).max(6).optional(),
  start: z.number().int().min(1).optional(),
  language: z.string().max(80).nullable().optional(),
  textAlign: z
    .enum(['left', 'center', 'right', 'justify'])
    .nullable()
    .optional(),
  checked: z.boolean().optional(),
  open: z.boolean().optional(),
  src: image.optional(),
  alt: z.string().max(1000).nullable().optional(),
  title: z.string().max(1000).nullable().optional(),
  width: z
    .union([z.number().min(1).max(4096), z.string().regex(/^\d{1,4}(px|%)?$/)])
    .nullable()
    .optional(),
  height: z
    .union([z.number().min(1).max(4096), z.string().regex(/^\d{1,4}(px|%)?$/)])
    .nullable()
    .optional(),
  colspan: z.number().int().min(1).max(30).optional(),
  rowspan: z.number().int().min(1).max(30).optional(),
  colwidth: z
    .array(z.number().int().min(1).max(4096))
    .max(30)
    .nullable()
    .optional(),
});
const mark = z
  .object({
    type: z.enum([
      'bold',
      'italic',
      'strike',
      'code',
      'underline',
      'subscript',
      'superscript',
      'link',
      'highlight',
      'textStyle',
    ]),
    attrs: z
      .object({
        href: z.string().max(2000).refine(safeLink).optional(),
        target: z.literal('_blank').nullable().optional(),
        rel: z.string().max(100).nullable().optional(),
        class: z.string().max(200).nullable().optional(),
        color: z.string().max(80).nullable().optional(),
        backgroundColor: z.string().max(80).nullable().optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'link' && !value.attrs?.href)
      ctx.addIssue({ code: 'custom', message: 'Link requires a URL' });
  });
/** No raw HTML, private task mentions, arbitrary embeds, or executable URLs. */
export const richTextNodeSchema: z.ZodType<LettinNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'doc',
        'paragraph',
        'text',
        'heading',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'hardBreak',
        'horizontalRule',
        'codeBlock',
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
        'taskList',
        'taskItem',
        'details',
        'detailsSummary',
        'detailsContent',
        'image',
        'imageResize',
      ]),
      text: z.string().max(100000).optional(),
      attrs: attrs.optional(),
      marks: z.array(mark).max(10).optional(),
      content: z.array(richTextNodeSchema).max(2000).optional(),
    })
    .superRefine((node, ctx) => {
      if (['image', 'imageResize'].includes(node.type) && !node.attrs?.src)
        ctx.addIssue({ code: 'custom', message: 'Image requires a source' });
    })
);
