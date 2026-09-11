import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));

import { beginAiStudioRun } from '@tuturuuu/ai/studio/metering';

const input = {
  actorId: 'actor',
  apiKeyId: 'key',
  feature: 'colab_compile',
  modelId: 'model',
  requestId: 'request',
  reservedCredits: 1,
  workspaceId: 'root',
  idempotencyKey: 'job:1',
  rejectExisting: true,
};
describe('transactional sponsored reservation fencing', () => {
  it.each([0, 100])(
    'accepts a new reservation with %s remaining credits',
    async (remaining) => {
      mocks.rpc.mockResolvedValue({
        data: [
          {
            success: true,
            run_id: 'run',
            reservation_id: 'reservation',
            remaining_credits: remaining,
          },
        ],
        error: null,
      });
      await expect(beginAiStudioRun(input)).resolves.toMatchObject({
        runId: 'run',
      });
    }
  );
  it('rejects an already committed idempotent run without another database update', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          success: true,
          run_id: 'run',
          reservation_id: 'reservation',
          remaining_credits: null,
        },
      ],
      error: null,
    });
    await expect(beginAiStudioRun(input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('rejects a concurrent unique-key loser whose transaction rolls back', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    await expect(beginAiStudioRun(input)).rejects.toMatchObject({
      status: 409,
    });
  });
});
