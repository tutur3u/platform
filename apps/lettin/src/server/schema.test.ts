import { describe, expect, it } from 'vitest';
import { lettinCommandSchema, withinLettinDepth } from './schema';

const draft = {
  title: 'A quiet world',
  description: '',
  credit: '',
  image: '',
  kind: 'page',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    ],
  },
};
describe('Lettin content boundary', () => {
  it('accepts the editor vocabulary', () =>
    expect(
      lettinCommandSchema.safeParse({ action: 'createWorld', draft }).success
    ).toBe(true));
  it('rejects raw HTML embeds', () =>
    expect(
      lettinCommandSchema.safeParse({
        action: 'createWorld',
        draft: {
          ...draft,
          content: { type: 'iframe', attrs: { src: 'https://example.com' } },
        },
      }).success
    ).toBe(false));
  it('rejects executable artwork URLs', () =>
    expect(
      lettinCommandSchema.safeParse({
        action: 'createWorld',
        draft: { ...draft, image: 'javascript:alert(1)' },
      }).success
    ).toBe(false));
  it('requires revisions for saves', () =>
    expect(
      lettinCommandSchema.safeParse({
        action: 'saveWorld',
        worldId: '00000000-0000-4000-8000-000000008401',
        draft,
      }).success
    ).toBe(false));
  it('does not accept delegated invitation fields', () => {
    const command = lettinCommandSchema.parse({
      action: 'invite',
      email: 'creator@example.com',
      canInvite: true,
    });
    expect(command).not.toHaveProperty('canInvite');
  });
  it('rejects unbounded nested documents before recursive parsing', () => {
    let content: unknown = {};
    for (let i = 0; i < 30; i++) content = { content };
    expect(withinLettinDepth(content)).toBe(false);
  });
  it('rejects private entry links in world metadata', () =>
    expect(
      lettinCommandSchema.safeParse({
        action: 'createWorld',
        draft: { ...draft, links: ['00000000-0000-4000-8000-000000008401'] },
      }).success
    ).toBe(false));
});
