import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { lettinDraftSchema } from '../server/schema';
import { createEntryDraft } from './entry-starters';
import { entryKinds } from './wiki-model';

for (const [language, messages] of Object.entries({ en, vi })) {
  describe(`${language} wiki entry starters`, () => {
    for (const kind of entryKinds) {
      it(`creates a schema-valid editable ${kind} outline`, () => {
        const draft = createEntryDraft('New entry', kind, true, (key) => {
          const text = messages.lettin[key as keyof typeof messages.lettin];
          expect(text).toBeTypeOf('string');
          expect(text.length).toBeGreaterThan(0);
          return text;
        });
        expect(lettinDraftSchema.safeParse(draft).success).toBe(true);
        expect(draft.kind).toBe(kind);
        expect(draft.content.content).toHaveLength(6);
        expect(draft.content.content?.map((node) => node.type)).toEqual([
          'heading',
          'paragraph',
          'heading',
          'paragraph',
          'heading',
          'paragraph',
        ]);
        expect(draft.tags).toEqual([]);
        expect(draft.links).toEqual([]);
        expect(draft.wiki).toEqual({
          aliases: [],
          facts: [],
          relationships: [],
        });
        expect(draft.image).toBe('');
      });
      it(`keeps ${kind} blank without requiring translations`, () => {
        const draft = createEntryDraft('Untitled', kind, false, () => {
          throw new Error('Blank entries must not add prompts');
        });
        expect(lettinDraftSchema.safeParse(draft).success).toBe(true);
        expect(draft.content).toEqual({
          type: 'doc',
          content: [{ type: 'paragraph' }],
        });
      });
    }
  });
}

it('does not share mutable content between created entries', () => {
  const first = createEntryDraft('First', 'character', true, (key) => key);
  const second = createEntryDraft('Second', 'character', true, (key) => key);
  first.content.content![0]!.content![0]!.text = 'Changed';
  first.wiki!.aliases.push('Alias');
  expect(second.content.content![0]!.content![0]!.text).toBe(
    'entryPromptidentity'
  );
  expect(second.wiki!.aliases).toEqual([]);
});
