import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it('does not generate randomness during import', async () => {
  vi.resetModules();
  const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');

  await import('./assistant-identity');

  expect(randomUUID).not.toHaveBeenCalled();
});

it('generates one random marker on first use and reuses it', async () => {
  vi.resetModules();
  const uuid = 'c4272b12-018e-4a21-b10b-7e8e80970126';
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValue(uuid);
  const { getMeetMentionMarker, remarkMeetMentions } = await import(
    './assistant-identity'
  );
  const transform = remarkMeetMentions();
  expect(randomUUID).not.toHaveBeenCalled();

  const tree = {
    type: 'paragraph',
    children: [{ type: 'text', value: '@ttr' }],
  };
  transform(tree);
  expect(tree.children[0]).toMatchObject({ title: `meet-mention:${uuid}` });
  expect(getMeetMentionMarker()).toBe(`meet-mention:${uuid}`);
  transform({ type: 'paragraph', children: [{ type: 'text', value: '@ttr' }] });
  expect(getMeetMentionMarker()).toBe(`meet-mention:${uuid}`);
  expect(randomUUID).toHaveBeenCalledTimes(1);
});

it('leaves authored links inert without generating a marker', async () => {
  vi.resetModules();
  const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');
  const { MEET_ASSISTANT_PROFILE, remarkMeetMentions } = await import(
    './assistant-identity'
  );
  const tree = {
    type: 'link',
    url: MEET_ASSISTANT_PROFILE,
    title: 'meet-mention:authored',
    children: [{ type: 'text', value: '@ttr' }],
  };
  const before = structuredClone(tree);

  remarkMeetMentions()(tree);

  expect(tree).toEqual(before);
  expect(randomUUID).not.toHaveBeenCalled();
});
