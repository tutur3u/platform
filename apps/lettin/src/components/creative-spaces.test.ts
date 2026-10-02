import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { lettinDraftSchema } from '../server/schema';
import { belongsToSpace, isCreativeSpace } from './spaces';
import { createStarterDraft, starterTypes } from './starter-drafts';

describe('creative spaces and saved starters', () => {
  it('keeps existing untagged projects discoverable without rewriting them', () => {
    const draft = { tags: ['fantasy'] };
    expect(belongsToSpace(draft, 'world')).toBe(true);
    expect(belongsToSpace(draft, 'art')).toBe(false);
    expect(draft.tags).toEqual(['fantasy']);
  });
  it('allows a project in multiple spaces and handles mixed-case tags', () => {
    const draft = { tags: ['ART', 'Story'] };
    expect(belongsToSpace(draft, 'art')).toBe(true);
    expect(belongsToSpace(draft, 'story')).toBe(true);
    expect(belongsToSpace(draft, 'world')).toBe(false);
    expect(belongsToSpace({ tags: [...draft.tags, 'world'] }, 'world')).toBe(
      true
    );
  });
  it('rejects unknown space routes', () => {
    expect(isCreativeSpace('art')).toBe(true);
    expect(isCreativeSpace('admin')).toBe(false);
    expect(isCreativeSpace('../world')).toBe(false);
  });
  for (const locale of [en, vi]) {
    for (const starter of starterTypes) {
      it(`produces a valid localized ${starter} notebook in ${locale === en ? 'English' : 'Vietnamese'}`, () => {
        const draft = createStarterDraft('Project', starter, (key) => {
          const value = locale.lettin[key as keyof typeof locale.lettin];
          expect(value).toBeTypeOf('string');
          return value;
        });
        expect(lettinDraftSchema.safeParse(draft).success).toBe(true);
        expect(draft.image).toBe('');
        expect(draft.links).toEqual([]);
        expect(draft.content.content).toHaveLength(starter === 'blank' ? 1 : 8);
        if (starter !== 'blank')
          expect(belongsToSpace(draft, starter)).toBe(true);
      });
    }
  }
});
