import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ insert: vi.fn(), probe: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: () => ({
        insert: f.insert,
        select: () => ({ limit: f.probe }),
      }),
    }),
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
      const { recordMiraChoice, NOTICE_MODE_PROBE_TTL_MS } =
        await import('./room-mira-evidence');
      f.insert
        .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
        .mockResolvedValue({ error: null });
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[1]?.[0]).not.toHaveProperty('notice_mode');
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[2]?.[0]).not.toHaveProperty('notice_mode');
      vi.advanceTimersByTime(NOTICE_MODE_PROBE_TTL_MS + 1);
      await recordMiraChoice({ ...evidence, noticeMode: 'self' });
      expect(f.insert.mock.calls[3]?.[0]).toMatchObject({
        notice_mode: 'self',
      });
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

  it('always stores an off, dropping the mode when the column is missing', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValue({ error: null });
    await recordMiraChoice({
      ...evidence,
      choice: 'off',
      noticeMode: 'self',
      requireNoticeMode: true,
    });
    expect(f.insert).toHaveBeenCalledTimes(2);
    expect(f.insert.mock.calls[1]?.[0]).toMatchObject({ choice: 'off' });
    expect(f.insert.mock.calls[1]?.[0]).not.toHaveProperty('notice_mode');
  });

  it('stores an off even while the column is known to be missing', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValue({ error: null });
    await recordMiraChoice({ ...evidence, noticeMode: 'self' });
    await recordMiraChoice({
      ...evidence,
      choice: 'off',
      noticeMode: 'self',
      requireNoticeMode: true,
    });
    expect(f.insert.mock.calls.at(-1)?.[0]).toMatchObject({ choice: 'off' });
  });
});

describe('notice mode storage check', () => {
  it('answers true when the column exists', async () => {
    const { canStoreMiraNoticeMode } = await import('./room-mira-evidence');
    f.probe.mockResolvedValue({ error: null });
    expect(await canStoreMiraNoticeMode()).toBe(true);
  });

  it.each(['PGRST204', '42703'])(
    'answers false for a missing column (%s) and remembers it',
    async (code) => {
      const { canStoreMiraNoticeMode } = await import('./room-mira-evidence');
      f.probe.mockResolvedValue({ error: { code } });
      expect(await canStoreMiraNoticeMode()).toBe(false);
      expect(await canStoreMiraNoticeMode()).toBe(false);
      expect(f.probe).toHaveBeenCalledTimes(1);
    }
  );

  it('throws when the check itself fails', async () => {
    const { canStoreMiraNoticeMode } = await import('./room-mira-evidence');
    f.probe.mockResolvedValue({ error: { code: '08006' } });
    await expect(canStoreMiraNoticeMode()).rejects.toThrow();
  });
});

describe('Mira choice pending id', () => {
  const pendingId = '0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c4';
  const missing = (column: string) => ({
    error: {
      code: 'PGRST204',
      message: `Could not find the '${column}' column of 'meet_mira_participant_choices'`,
    },
  });

  it('stores the pending id with the on', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert.mockResolvedValue({ error: null });
    await recordMiraChoice({ ...evidence, pendingId });
    expect(f.insert.mock.calls[0]?.[0]).toMatchObject({ pending_id: pendingId });
  });

  it('drops a missing pending id column but keeps a required notice mode', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert
      .mockResolvedValueOnce(missing('pending_id'))
      .mockResolvedValue({ error: null });
    await recordMiraChoice({
      ...evidence,
      pendingId,
      noticeMode: 'self',
      requireNoticeMode: true,
    });
    expect(f.insert).toHaveBeenCalledTimes(2);
    expect(f.insert.mock.calls[1]?.[0]).toMatchObject({ notice_mode: 'self' });
    expect(f.insert.mock.calls[1]?.[0]).not.toHaveProperty('pending_id');
  });

  it('still fails a required notice mode after dropping the pending id', async () => {
    const { recordMiraChoice } = await import('./room-mira-evidence');
    f.insert
      .mockResolvedValueOnce(missing('pending_id'))
      .mockResolvedValue(missing('notice_mode'));
    await expect(
      recordMiraChoice({
        ...evidence,
        pendingId,
        noticeMode: 'self',
        requireNoticeMode: true,
      })
    ).rejects.toThrow();
    expect(f.insert).toHaveBeenCalledTimes(2);
  });

  it('keeps the Postgres code of a refused row', async () => {
    const { recordMiraChoice, MiraChoiceRecordError } = await import(
      './room-mira-evidence'
    );
    f.insert.mockResolvedValue({ error: { code: '23503' } });
    const error = await recordMiraChoice(evidence).catch((caught) => caught);
    expect(error).toBeInstanceOf(MiraChoiceRecordError);
    expect(error.pgCode).toBe('23503');
  });
});
