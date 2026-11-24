import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));

const input = {
  sessionId: 's',
  accountId: 'a',
  decision: 'allow' as const,
  noticeVersion: 'n',
  roomSeq: 3,
  evidence: { locale: 'en', textHash: 'd'.repeat(64) },
};

function client(rpc: ReturnType<typeof vi.fn>) {
  return { schema: () => ({ rpc }) } as never;
}

beforeEach(() => {
  vi.resetModules();
});

describe('record_decision notice evidence feature check', () => {
  it('sends the evidence when the database accepts it', async () => {
    const { selfRpc } = await import('./self-v1-rpc');
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ revision: 1, recorded: true }], error: null });
    await selfRpc.recordDecision(client(rpc), input);
    expect(rpc).toHaveBeenCalledWith(
      'meet_ai_self_v1_record_decision',
      expect.objectContaining({ p_locale: 'en', p_text_hash: 'd'.repeat(64) })
    );
  });

  it('falls back once without evidence on PGRST202 and remembers it', async () => {
    const { selfRpc } = await import('./self-v1-rpc');
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValue({ data: [{ revision: 2, recorded: true }], error: null });
    expect(await selfRpc.recordDecision(client(rpc), input)).toEqual({
      revision: 2,
      recorded: true,
    });
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_locale');
    await selfRpc.recordDecision(client(rpc), input);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[2]?.[1]).not.toHaveProperty('p_locale');
  });

  it('never retries a real refusal without evidence', async () => {
    const { selfRpc } = await import('./self-v1-rpc');
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '40001' } });
    await expect(
      selfRpc.recordDecision(client(rpc), input)
    ).rejects.toMatchObject({ pgCode: '40001' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('sends no evidence parameters for a withdraw', async () => {
    const { selfRpc } = await import('./self-v1-rpc');
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ revision: 3, recorded: true }], error: null });
    await selfRpc.recordDecision(client(rpc), {
      ...input,
      decision: 'withdraw',
      evidence: undefined,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_locale');
  });
});
