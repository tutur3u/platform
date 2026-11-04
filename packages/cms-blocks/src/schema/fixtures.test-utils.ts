import type { CmsBlock, CmsPage } from './schema';
import { createEmptyCmsPage } from './schema';

export const doc = {
  content: [
    { content: [{ text: 'Hello IEEAI', type: 'text' }], type: 'paragraph' },
    {
      content: [{ marks: [{ type: 'bold' }], text: 'Bold', type: 'text' }],
      type: 'paragraph',
    },
  ],
  type: 'doc' as const,
};

export const leafBlocks: CmsBlock[] = [
  {
    props: {
      ctaHref: '/join',
      ctaLabel: 'Join',
      id: 'h',
      imageUrl: '/hero.png',
      subtitle: 'AI',
      title: 'IEEAI',
    },
    type: 'Hero',
  },
  { props: { doc, id: 'r' }, type: 'RichText' },
  {
    props: {
      alt: 'Stage',
      caption: 'Keynote',
      id: 'i',
      src: 'https://ieeai.net/a.jpg',
    },
    type: 'Image',
  },
  {
    props: { href: '/apply', id: 'c', label: 'Apply', variant: 'primary' },
    type: 'CtaButton',
  },
  {
    props: {
      cards: [{ body: 'B', href: '/x', imageUrl: '', title: 'Card' }],
      columns: '3',
      id: 'g',
    },
    type: 'CardGrid',
  },
  {
    props: {
      events: [
        {
          href: '/e',
          location: 'HCMC',
          startsAt: '2026-12-01',
          title: 'Summit',
        },
      ],
      heading: 'Events',
      id: 'l',
    },
    type: 'EventList',
  },
  {
    props: {
      description: doc,
      endsAt: '2026-12-02',
      id: 'd',
      location: 'HCMC',
      registerHref: '/r',
      startsAt: '2026-12-01',
      title: 'Summit',
    },
    type: 'EventDetails',
  },
  { props: { id: 's', size: 'lg' }, type: 'Spacer' },
];

export const allBlocks: CmsBlock[] = [
  ...leafBlocks,
  {
    props: {
      id: 't',
      left: [leafBlocks[1] as never],
      ratio: '1:2',
      right: [leafBlocks[2] as never],
    },
    type: 'TwoColumn',
  },
];

export const samplePage: CmsPage = {
  ...createEmptyCmsPage('Home'),
  content: allBlocks,
};
