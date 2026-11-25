import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  result: vi.fn(),
  calls: [] as Array<[string, ...unknown[]]>,
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: (name: string) => {
      f.calls.push(['schema', name]);
      const chain: Record<string, unknown> = {
        from: (table: string) => {
          f.calls.push(['from', table]);
          return chain;
        },
        select: (columns: string) => {
          f.calls.push(['select', columns]);
          return chain;
        },
        eq: (column: string, value: unknown) => {
          f.calls.push(['eq', column, value]);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          f.calls.push(['neq', column, value]);
          return chain;
        },
        order: (column: string, options: unknown) => {
          f.calls.push(['order', column, options]);
          return chain;
        },
        limit: (count: number) => {
          f.calls.push(['limit', count]);
          return chain;
        },
        maybeSingle: () => f.result(),
      };
      return chain;
    },
  }),
}));

import { readOwnMiraLastChoice } from './room-mira-evidence';

const account = { meetingId: 'meeting', participantId: 'user', guest: false };
const guest = { meetingId: 'meeting', participantId: 'guest-id', guest: true };

beforeEach(() => {
  vi.resetAllMocks();
  f.calls.length = 0;
});

it("reads only the caller's own latest row, newest first", async () => {
  f.result.mockResolvedValue({ data: { choice: 'off' }, error: null });
  expect(await readOwnMiraLastChoice(account)).toBe('off');
  expect(f.calls).toEqual([
    ['schema', 'private'],
    ['from', 'meet_mira_participant_choices'],
    ['select', 'choice'],
    ['eq', 'meeting_id', 'meeting'],
    ['eq', 'guest', false],
    ['eq', 'user_id', 'user'],
    ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: false }],
    ['limit', 1],
  ]);
});

it("keys a guest by the server-issued guest id, never an account's rows", async () => {
  f.result.mockResolvedValue({ data: { choice: 'on' }, error: null });
  expect(await readOwnMiraLastChoice(guest)).toBe('on');
  expect(f.calls).toContainEqual(['eq', 'guest', true]);
  expect(f.calls).toContainEqual(['eq', 'participant_ref', 'guest-id']);
  expect(f.calls.some((call) => call[1] === 'user_id')).toBe(false);
});

it('returns null when the caller never chose here', async () => {
  f.result.mockResolvedValue({ data: null, error: null });
  expect(await readOwnMiraLastChoice(account)).toBeNull();
});

it('returns undefined when the lookup fails, so the box is not guessed ticked', async () => {
  f.result.mockResolvedValue({ data: null, error: new Error('down') });
  expect(await readOwnMiraLastChoice(account)).toBeUndefined();
  f.result.mockRejectedValue(new Error('network'));
  expect(await readOwnMiraLastChoice(account)).toBeUndefined();
});

it('excludes staged auto-on evidence when checking for an explicit opt-out', async () => {
  f.result.mockResolvedValue({ data: { choice: 'off' }, error: null });
  expect(await readOwnMiraLastChoice({ ...account, explicitOnly: true })).toBe('off');
  expect(f.calls).toContainEqual(['neq', 'source', 'auto_on']);
});
