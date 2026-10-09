import { describe, expect, it } from 'vitest';
import { createStarterDraft } from '../components/starter-drafts';
import { lettinCommandSchema, lettinDraftSchema } from './schema';

const draft = createStarterDraft('Notebook', 'blank', (key) => key);
const worldId = '00000000-0000-4000-8000-000000000001';

describe('creator content notices', () => {
  it('accepts historical drafts without adding a notice', () => {
    expect(lettinDraftSchema.parse(draft).contentNotice).toBeUndefined();
  });
  it('bounds and normalizes notices on actual save commands', () => {
    const command = { action: 'saveWorld', worldId, version: 1, draft };
    const parsed = lettinCommandSchema.parse({
      ...command,
      draft: { ...draft, contentNotice: '  Spoilers\nViolence  ' },
    });
    expect('draft' in parsed && parsed.draft.contentNotice).toBe(
      'Spoilers\nViolence'
    );
    expect(
      lettinCommandSchema.safeParse({
        ...command,
        draft: { ...draft, contentNotice: 'x'.repeat(501) },
      }).success
    ).toBe(false);
    expect(
      lettinDraftSchema.safeParse({ ...draft, contentNotice: 'x'.repeat(500) })
        .success
    ).toBe(true);
  });
  it('allows clearing without changing publication commands', () => {
    expect(
      lettinDraftSchema.parse({ ...draft, contentNotice: '  ' }).contentNotice
    ).toBe('');
    expect(
      lettinCommandSchema.parse({ action: 'publishWorld', worldId, version: 2 })
    ).toEqual({ action: 'publishWorld', worldId, version: 2 });
  });
});
