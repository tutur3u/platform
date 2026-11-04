import { z } from 'zod';
import { resolveCmsEmbed } from './embed';

/**
 * Bump with an `upgradePage` step whenever a stored block shape changes or is
 * removed. Adding a block type keeps the version; ship renderer support for a
 * new type before any editor can insert it.
 */
export const CMS_BLOCKS_SCHEMA_VERSION = 1;

export type TipTapNode = {
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: { attrs?: Record<string, unknown>; type: string }[];
  text?: string;
  type: string;
};

const tipTapNodeSchema: z.ZodType<TipTapNode> = z.lazy(() =>
  z.object({
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(tipTapNodeSchema).optional(),
    marks: z
      .array(
        z.object({
          attrs: z.record(z.string(), z.unknown()).optional(),
          type: z.string(),
        })
      )
      .optional(),
    text: z.string().optional(),
    type: z.string(),
  })
);

/** TipTap/ProseMirror JSON (`editor.getJSON()`), the same shape packages/editor emits. */
export const tipTapDocSchema = z.object({
  content: z.array(tipTapNodeSchema).optional(),
  type: z.literal('doc'),
});

const text = z.string().max(2000);
const url = z.string().max(2048);
/** In-page anchor (`#about`): lowercase slug, empty when unused. */
const anchor = z.string().regex(/^(?:[a-z][a-z0-9-]{0,63})?$/);
/** Empty while unset; otherwise it must resolve to an allowlisted provider. */
const embedUrl = url.refine(
  (value) => value === '' || resolveCmsEmbed(value) !== null,
  {
    message: 'Unsupported embed URL',
  }
);

/** Prop shapes per block type, excluding Puck's `id`. Field configs must mirror these keys. */
export const cmsLeafBlockProps = {
  Hero: {
    ctaHref: url,
    ctaLabel: text,
    imageUrl: url,
    subtitle: text,
    title: text,
  },
  RichText: { doc: tipTapDocSchema },
  Image: { alt: text, caption: text, src: url },
  CtaButton: {
    href: url,
    label: text,
    variant: z.enum(['primary', 'secondary']),
  },
  CardGrid: {
    cards: z
      .array(z.object({ body: text, href: url, imageUrl: url, title: text }))
      .max(24),
    columns: z.enum(['2', '3', '4']),
  },
  EventList: {
    events: z
      .array(
        z.object({ href: url, location: text, startsAt: text, title: text })
      )
      .max(50),
    heading: text,
  },
  EventDetails: {
    description: tipTapDocSchema,
    endsAt: text,
    location: text,
    registerHref: url,
    startsAt: text,
    title: text,
  },
  Spacer: { size: z.enum(['sm', 'md', 'lg', 'xl']) },
  Heading: {
    align: z.enum(['left', 'center', 'right']),
    anchor,
    level: z.enum(['1', '2', '3', '4', '5', '6']),
    text,
  },
  Gallery: {
    aspect: z.enum(['auto', 'square', 'video']),
    columns: z.enum(['2', '3', '4']),
    images: z.array(z.object({ alt: text, caption: text, src: url })).max(48),
  },
  Embed: {
    aspect: z.enum(['16:9', '4:3', '1:1']),
    title: text,
    url: embedUrl,
  },
  Accordion: {
    heading: text,
    items: z
      .array(z.object({ answer: tipTapDocSchema, question: text }))
      .max(50),
  },
  Divider: {
    spacing: z.enum(['sm', 'md', 'lg']),
    variant: z.enum(['solid', 'dashed']),
  },
} as const;

function blockSchema<T extends string, P extends z.ZodRawShape>(
  type: T,
  props: P
) {
  return z.object({
    props: z.object({ id: z.string().min(1), ...props }).strict(),
    type: z.literal(type),
  });
}

const p = cmsLeafBlockProps;
const leafSchemas = [
  blockSchema('Hero', p.Hero),
  blockSchema('RichText', p.RichText),
  blockSchema('Image', p.Image),
  blockSchema('CtaButton', p.CtaButton),
  blockSchema('CardGrid', p.CardGrid),
  blockSchema('EventList', p.EventList),
  blockSchema('EventDetails', p.EventDetails),
  blockSchema('Spacer', p.Spacer),
  blockSchema('Heading', p.Heading),
  blockSchema('Gallery', p.Gallery),
  blockSchema('Embed', p.Embed),
  blockSchema('Accordion', p.Accordion),
  blockSchema('Divider', p.Divider),
] as const;

export const cmsLeafBlockSchema = z.discriminatedUnion('type', leafSchemas);

/** Layout blocks hold leaf blocks only; nested layouts are out of scope for M1. */
export const cmsLayoutBlockProps = {
  TwoColumn: {
    left: z.array(cmsLeafBlockSchema).max(50),
    ratio: z.enum(['1:1', '1:2', '2:1']),
    right: z.array(cmsLeafBlockSchema).max(50),
  },
  /** Section/Container: a full-width band that groups leaf blocks. */
  Section: {
    anchor,
    background: z.enum(['none', 'muted', 'accent']),
    children: z.array(cmsLeafBlockSchema).max(50),
    padding: z.enum(['none', 'sm', 'md', 'lg']),
    width: z.enum(['narrow', 'default', 'wide', 'full']),
  },
} as const;

export const cmsBlockSchema = z.discriminatedUnion('type', [
  ...leafSchemas,
  blockSchema('TwoColumn', cmsLayoutBlockProps.TwoColumn),
  blockSchema('Section', cmsLayoutBlockProps.Section),
]);

export const cmsPageSchema = z.object({
  content: z.array(cmsBlockSchema).max(200),
  root: z.object({ props: z.object({ title: text }).partial() }),
  schemaVersion: z.literal(CMS_BLOCKS_SCHEMA_VERSION),
});

export const cmsBlockProps = { ...cmsLeafBlockProps, ...cmsLayoutBlockProps };
export type CmsBlockType = keyof typeof cmsBlockProps;
export type CmsLeafBlock = z.infer<typeof cmsLeafBlockSchema>;
export type CmsBlock = z.infer<typeof cmsBlockSchema>;
export type CmsPage = z.infer<typeof cmsPageSchema>;
export type CmsBlockPropsOf<T extends CmsBlockType> = Extract<
  CmsBlock,
  { type: T }
>['props'];

export function createEmptyCmsPage(title = ''): CmsPage {
  return {
    content: [],
    root: { props: { title } },
    schemaVersion: CMS_BLOCKS_SCHEMA_VERSION,
  };
}
