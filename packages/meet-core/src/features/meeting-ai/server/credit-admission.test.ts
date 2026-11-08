import { beforeEach, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: check,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { ws_id: 'meeting-workspace' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { admitMeetCredits } from './credit-admission';

const allowed = { allowed: true, tier: 'FREE', maxOutputTokens: 2048 };
const failedCheck = { allowed: false, errorCode: 'CREDIT_CHECK_FAILED' };
beforeEach(() => vi.resetAllMocks());

it('retries a transient credit check and admits once it recovers', async () => {
  check.mockResolvedValueOnce(failedCheck).mockResolvedValueOnce(allowed);
  await expect(admitMeetCredits('actor', 'meeting')).resolves.toEqual({
    workspaceId: 'meeting-workspace',
    allowance: allowed,
  });
  expect(check).toHaveBeenCalledTimes(2);
  expect(check).toHaveBeenCalledWith(
    'meeting-workspace',
    'google/gemini-3.1-flash-lite',
    'generate',
    { userId: 'actor' }
  );
});

it('retries a thrown credit check', async () => {
  check
    .mockRejectedValueOnce(new Error('fetch failed'))
    .mockResolvedValueOnce(allowed);
  await expect(admitMeetCredits('actor', 'meeting')).resolves.toMatchObject({
    allowance: allowed,
  });
  expect(check).toHaveBeenCalledTimes(2);
});

it('bounds transient retries and returns a retryable 503', async () => {
  check.mockResolvedValue(failedCheck);
  await expect(admitMeetCredits('actor', 'meeting')).rejects.toMatchObject({
    status: 503,
    code: 'MEET_AI_CREDIT_CHECK_FAILED',
  });
  expect(check).toHaveBeenCalledTimes(3);
});

it.each([
  ['CREDITS_EXHAUSTED', 'MEET_AI_CREDITS_EXHAUSTED'],
  ['DAILY_LIMIT_REACHED', 'MEET_AI_CREDITS_DAILY_LIMIT'],
  ['MODEL_NOT_ALLOWED', 'MEET_AI_MODEL_NOT_ON_PLAN'],
  ['NO_ALLOCATION', 'MEET_AI_CREDITS_UNAVAILABLE'],
  [null, 'MEET_AI_CREDITS_UNAVAILABLE'],
])('refuses %s once without retrying', async (errorCode, code) => {
  check.mockResolvedValue({ allowed: false, errorCode });
  await expect(admitMeetCredits('actor', 'meeting')).rejects.toMatchObject({
    status: 402,
    code,
  });
  expect(check).toHaveBeenCalledTimes(1);
});

it.each(['host', 'member', 'guest'])(
  'bills the meeting workspace and attributes the %s actor',
  async (userId) => {
    check.mockResolvedValue(allowed);
    await expect(admitMeetCredits(userId, 'meeting')).resolves.toMatchObject({
      workspaceId: 'meeting-workspace',
    });
    expect(check).toHaveBeenCalledWith(
      'meeting-workspace',
      expect.any(String),
      'generate',
      { userId }
    );
  }
);
