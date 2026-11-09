import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./access', () => ({ MeetAiError: class extends Error {} }));

import { readTranscriptRoster } from './transcript-roster';

const id = '00000000-0000-4000-8000-000000000001';
it('resolves surviving verified legacy accounts to current roster labels', async () => {
  const filter = vi.fn().mockResolvedValue({
    data: [{ id, display_name: ' Current Alice ' }],
    error: null,
  });
  const select = vi.fn().mockReturnValue({ in: filter });
  const db = { from: vi.fn().mockReturnValue({ select }) };
  const roster = await readTranscriptRoster(db as never, [
    {
      usage: {
        segments: [
          { erased: true },
          {
            speaker: {
              accountId: id,
              displayName: 'STALE name',
              kind: 'microphone',
            },
            kind: 'microphone',
            startSeconds: 0,
            transcript: 'Speech',
          },
        ],
      },
    },
  ]);
  expect([...roster]).toEqual([[id, 'Current Alice']]);
  expect(db.from).toHaveBeenCalledExactlyOnceWith('users');
  expect(select).toHaveBeenCalledExactlyOnceWith('id, display_name');
  expect(filter).toHaveBeenCalledExactlyOnceWith('id', [id]);
});
it.each([null, '', 'private@example.com'])(
  'does not expose unsafe profile name %s',
  async (name) => {
    const db = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: [{ id, display_name: name }], error: null }),
        }),
      }),
    };
    expect([
      ...(await readTranscriptRoster(db as never, [
        {
          usage: {
            speaker: {
              accountId: id,
              displayName: 'STALE name',
              kind: 'microphone',
            },
          },
        },
      ])),
    ]).toEqual([[id, 'Participant']]);
  }
);
it('does not resolve erased sources or invent missing roster members', async () => {
  const from = vi.fn();
  expect(
    (
      await readTranscriptRoster({ from } as never, [
        { usage: { erased: true } },
      ])
    ).size
  ).toBe(0);
  expect(from).not.toHaveBeenCalled();
});

it('never treats opaque selectors as account IDs before a selector roster adapter exists', async () => {
  const from = vi.fn();
  const roster = await readTranscriptRoster({ from } as never, [
    { usage: { speaker: { selector: id, kind: 'microphone' } } },
  ]);
  expect(roster.size).toBe(0);
  expect(from).not.toHaveBeenCalled();
});
