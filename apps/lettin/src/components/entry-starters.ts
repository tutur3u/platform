import type {
  LettinDraft,
  LettinKind,
  LettinNode,
} from '@tuturuuu/internal-api/lettin';

const sections = {
  character: ['identity', 'appearance', 'motivation'],
  location: ['landscape', 'society', 'landmarks'],
  story: ['premise', 'conflict', 'chapters'],
  world: ['premise', 'people', 'rules'],
  event: ['cause', 'unfolding', 'aftermath'],
  role: ['duties', 'qualifications', 'influence'],
  organization: ['purpose', 'members', 'influence'],
  lore: ['origins', 'beliefs', 'consequences'],
  page: ['overview', 'details', 'references'],
} as const satisfies Record<LettinKind, readonly string[]>;

// Starters are normal draft content, not persisted template metadata.
export function createEntryDraft(
  title: string,
  kind: LettinKind,
  structured: boolean,
  translate: (key: string) => string
): LettinDraft {
  const content: LettinNode[] = structured
    ? sections[kind].flatMap((section) => [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: translate(`entryPrompt${section}`) }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: translate(`entryPrompt${section}Hint`) },
          ],
        },
      ])
    : [{ type: 'paragraph' }];
  return {
    title,
    kind,
    description: '',
    image: '',
    credit: '',
    tags: [],
    links: [],
    wiki: { aliases: [], facts: [], relationships: [] },
    content: { type: 'doc', content },
  };
}
