import {
  type CmsBlock,
  type CmsBlockPropsOf,
  type CmsBlockType,
  cmsBlockSchema,
  type TipTapNode,
} from './schema';

/**
 * Field kinds an editor must provide an input for. Labels are not stored here:
 * apps translate `blocks.<Type>` and `fields.<name>` from their own message bundles.
 */
export type CmsField =
  | { kind: 'text' | 'textarea' | 'url' | 'image' | 'richtext' }
  | { kind: 'select'; options: readonly string[] }
  | { kind: 'list'; itemFields: Record<string, CmsField> }
  /** A nested drop zone holding leaf blocks (layout blocks only). */
  | { kind: 'zone' };

export type CmsBlockCategory = 'content' | 'events' | 'layout';

type Defaults<T extends CmsBlockType> = Omit<CmsBlockPropsOf<T>, 'id'>;

export interface CmsBlockDefinition<T extends CmsBlockType> {
  category: CmsBlockCategory;
  defaults: Defaults<T>;
  fields: { [K in keyof Defaults<T>]-?: CmsField };
}

const text = { kind: 'text' } as const;
const textarea = { kind: 'textarea' } as const;
const url = { kind: 'url' } as const;
const image = { kind: 'image' } as const;
const richtext = { kind: 'richtext' } as const;
const zone = { kind: 'zone' } as const;
const select = (options: readonly string[]) =>
  ({ kind: 'select', options }) as const;
const emptyDoc: { content: TipTapNode[]; type: 'doc' } = {
  content: [],
  type: 'doc',
};

export const cmsBlockRegistry: { [T in CmsBlockType]: CmsBlockDefinition<T> } =
  {
    Hero: {
      category: 'content',
      defaults: {
        ctaHref: '',
        ctaLabel: '',
        imageUrl: '',
        subtitle: '',
        title: 'Page title',
      },
      fields: {
        ctaHref: url,
        ctaLabel: text,
        imageUrl: image,
        subtitle: textarea,
        title: text,
      },
    },
    RichText: {
      category: 'content',
      defaults: { doc: emptyDoc },
      fields: { doc: richtext },
    },
    Image: {
      category: 'content',
      defaults: { alt: '', caption: '', src: '' },
      fields: { alt: text, caption: text, src: image },
    },
    CtaButton: {
      category: 'content',
      defaults: { href: '/', label: 'Learn more', variant: 'primary' },
      fields: {
        href: url,
        label: text,
        variant: select(['primary', 'secondary']),
      },
    },
    CardGrid: {
      category: 'content',
      defaults: { cards: [], columns: '3' },
      fields: {
        cards: {
          itemFields: {
            body: textarea,
            href: url,
            imageUrl: image,
            title: text,
          },
          kind: 'list',
        },
        columns: select(['2', '3', '4']),
      },
    },
    EventList: {
      category: 'events',
      defaults: { events: [], heading: 'Events' },
      fields: {
        events: {
          itemFields: {
            href: url,
            location: text,
            startsAt: text,
            title: text,
          },
          kind: 'list',
        },
        heading: text,
      },
    },
    EventDetails: {
      category: 'events',
      defaults: {
        description: emptyDoc,
        endsAt: '',
        location: '',
        registerHref: '',
        startsAt: '',
        title: 'Event',
      },
      fields: {
        description: richtext,
        endsAt: text,
        location: text,
        registerHref: url,
        startsAt: text,
        title: text,
      },
    },
    Spacer: {
      category: 'layout',
      defaults: { size: 'md' },
      fields: { size: select(['sm', 'md', 'lg', 'xl']) },
    },
    TwoColumn: {
      category: 'layout',
      defaults: { left: [], ratio: '1:1', right: [] },
      fields: { left: zone, ratio: select(['1:1', '1:2', '2:1']), right: zone },
    },
    Section: {
      category: 'layout',
      defaults: {
        anchor: '',
        background: 'none',
        children: [],
        padding: 'md',
        width: 'default',
      },
      fields: {
        anchor: text,
        background: select(['none', 'muted', 'accent']),
        children: zone,
        padding: select(['none', 'sm', 'md', 'lg']),
        width: select(['narrow', 'default', 'wide', 'full']),
      },
    },
    Heading: {
      category: 'content',
      defaults: { align: 'left', anchor: '', level: '2', text: 'Heading' },
      fields: {
        align: select(['left', 'center', 'right']),
        anchor: text,
        level: select(['1', '2', '3', '4', '5', '6']),
        text,
      },
    },
    Gallery: {
      category: 'content',
      defaults: { aspect: 'auto', columns: '3', images: [] },
      fields: {
        aspect: select(['auto', 'square', 'video']),
        columns: select(['2', '3', '4']),
        images: {
          itemFields: { alt: text, caption: text, src: image },
          kind: 'list',
        },
      },
    },
    Embed: {
      category: 'content',
      defaults: { aspect: '16:9', title: '', url: '' },
      fields: { aspect: select(['16:9', '4:3', '1:1']), title: text, url },
    },
    Accordion: {
      category: 'content',
      defaults: { heading: '', items: [] },
      fields: {
        heading: text,
        items: {
          itemFields: { answer: richtext, question: text },
          kind: 'list',
        },
      },
    },
    Divider: {
      category: 'layout',
      defaults: { spacing: 'md', variant: 'solid' },
      fields: {
        spacing: select(['sm', 'md', 'lg']),
        variant: select(['solid', 'dashed']),
      },
    },
  };

export const cmsBlockTypes = Object.keys(cmsBlockRegistry) as CmsBlockType[];

/** Creates a schema-valid block from its registry defaults. */
export function createCmsBlock(type: CmsBlockType, id: string): CmsBlock {
  const defaults = structuredClone(cmsBlockRegistry[type].defaults);
  return cmsBlockSchema.parse({ props: { ...defaults, id }, type });
}
