import { afterEach, expect, it, vi } from 'vitest';

const tier = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./call-access', () => ({
  MeetCallAccessError: class extends Error {},
}));
vi.mock('@tuturuuu/utils/meet-duration', () => ({
  getHostMeetingTier: tier.lookup,
  getHostMeetingDurationSeconds: vi.fn(),
  meetingDurationSeconds: vi.fn(),
}));

const { getParticipantStreamTier } = await import('./meeting-duration');

afterEach(() => {
  vi.useRealTimers();
  tier.lookup.mockReset();
});

it('maps the participant plan to a stream tier', async () => {
  tier.lookup.mockResolvedValue('PRO');
  expect(await getParticipantStreamTier('a')).toBe('paid');
  tier.lookup.mockResolvedValue('FREE');
  expect(await getParticipantStreamTier('a')).toBe('free');
});

it('falls back to free when the lookup fails', async () => {
  tier.lookup.mockRejectedValue(new Error('db down'));
  expect(await getParticipantStreamTier('a')).toBe('free');
});

it('falls back to free when the lookup is slow', async () => {
  vi.useFakeTimers();
  tier.lookup.mockReturnValue(new Promise(() => undefined));
  const result = getParticipantStreamTier('a', 2000);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe('free');
});
