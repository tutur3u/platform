import type { LettinDraft, LettinNode } from '@tuturuuu/internal-api/lettin';

export const starterTypes = ['blank', 'world', 'story', 'art'] as const;
export type StarterType = (typeof starterTypes)[number];
const sections = {
  blank: [],
  world: ['premise', 'people', 'places', 'rules'],
  story: ['premise', 'voice', 'conflict', 'chapters'],
  art: ['vision', 'references', 'process', 'credits'],
} as const;

export function createStarterDraft(
  title: string,
  starter: StarterType,
  translate: (key: string) => string
): LettinDraft {
  const content: LettinNode[] = sections[starter].flatMap((section) => [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: translate(`prompt${section}`) }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: translate(`prompt${section}Hint`) }],
    },
  ]);
  return {
    title,
    description: '',
    image: '',
    credit: '',
    kind: 'page',
    tags: starter === 'blank' ? [] : [starter],
    links: [],
    content: {
      type: 'doc',
      content: content.length ? content : [{ type: 'paragraph' }],
    },
  };
}
