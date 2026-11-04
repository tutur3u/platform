import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc }) }),
}));

import { beginAiStudioRun } from './metering';

const input = {
  actorId: 'actor',
  feature: 'image',
  modelId: 'model',
  requestId: 'request',
  reservedCredits: 1,
  workspaceId: 'workspace',
  idempotencyKey: 'same',
};
describe('provider execution reservation claim', () => {
  beforeEach(() => rpc.mockReset());
  it.each([undefined, false])(
    'rejects an existing run when rejectExisting is %s',
    async (rejectExisting) => {
      rpc.mockResolvedValue({
        data: [
          {
            success: true,
            run_id: 'old-run',
            reservation_id: 'old-reservation',
            remaining_credits: null,
          },
        ],
        error: null,
      });
      await expect(
        beginAiStudioRun({ ...input, rejectExisting })
      ).rejects.toMatchObject({ status: 409 });
    }
  );
  it('rejects a concurrent idempotency-key loser', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    await expect(beginAiStudioRun(input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('accepts a fresh reservation even when it spends the last credit', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          success: true,
          run_id: 'new-run',
          reservation_id: 'new-reservation',
          remaining_credits: 0,
        },
      ],
      error: null,
    });
    await expect(beginAiStudioRun(input)).resolves.toEqual({
      runId: 'new-run',
      reservationId: 'new-reservation',
    });
  });
});
