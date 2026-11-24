import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({ from: () => ({ insert: f.insert }) }),
  }),
}));

const evidence = {
  meetingId: 'm',
  wsId: 'w',
  participantId: 'p',
  guest: false,
  choice: 'on' as const,
  source: 'toggle' as const,
  acceptanceRevision: 1,
  noticeVersion: 'v',
  textHash: 'a'.repeat(64),
  locale: 'en',
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe('Mira choice notice mode', () => {
  it('stores a room-capture choice exactly as before', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert.mockResolvedValue({ error: null });
    await recordMiraChoice(evidence);
    expect(f.insert.mock.calls[0]?.[0]).not.toHaveProperty('notice_mode');
  });

  it('stores the per-speaker notice mode when the column exists', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert.mockResolvedValue({ error: null });
    await recordMiraChoice({ ...evidence, noticeMode: 'self' });
    expect(f.insert.mock.calls[0]?.[0]).toMatchObject({ notice_mode: 'self' });
  });

  it('falls back without the column and re-probes after the window', async () => {
    vi.useFakeTimers();
    try {
      const { recordMiraChoice, NOTICE_MODE_PROBE_TTL_MS } = await import(
        './room-mira-evidence'
      );
      f.insert
        .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
        .mockResolvedValue({ error: null });
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[1]?.[0]).not.toHaveProperty('notice_mode');
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[2]?.[0]).not.toHaveProperty('notice_mode');
      vi.advanceTimersByTime(NOTICE_MODE_PROBE_TTL_MS + 1);
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[3]?.[0]).toMatchObject({ notice_mode: 'self' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed under per-speaker capture without the column', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert.mockResolvedValue({ error: { code: 'PGRST204' } });
    await expect(
      recordMiraChoice({
        ...evidence,
        noticeMode: 'self',
        requireNoticeMode: true,
      })
    ).rejects.toThrow();
    expect(f.insert).toHaveBeenCalledTimes(1);
  });

  it('still fails on any other storage error', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert.mockResolvedValue({ error: { code: '23514' } });
    await expect(
      recordMiraChoice({ ...evidence, noticeMode: 'self' })
    ).rejects.toThrow();
    expect(f.insert).toHaveBeenCalledTimes(1);
  });
});
