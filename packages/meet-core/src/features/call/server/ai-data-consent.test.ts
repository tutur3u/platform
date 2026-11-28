import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ has: vi.fn() }));

vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: '2026-11-28',
  lookupAiDataConsent: vi.fn(),
}));
vi.mock('@tuturuuu/ai/chat/ai-data-consent', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/ai/chat/ai-data-consent')
  >()),
  hasAiDataConsent: mocks.has,
}));

import { requireMeetAiDataConsent } from './ai-data-consent';

const request = (headers?: HeadersInit) =>
  new Request('https://meet.example.invalid/api', { method: 'POST', headers });

beforeEach(() => mocks.has.mockReset());

it('refuses a native bearer caller without consent', async () => {
  mocks.has.mockResolvedValue(false);
  await expect(
    requireMeetAiDataConsent(
      request({ Authorization: 'Bearer native.jwt' }),
      'actor'
    )
  ).rejects.toMatchObject({ status: 403, code: 'ai_consent_required' });
  expect(mocks.has).toHaveBeenCalledWith('actor');
});

it('passes a consented native caller', async () => {
  mocks.has.mockResolvedValue(true);
  await expect(
    requireMeetAiDataConsent(
      request({ Authorization: 'Bearer native.jwt' }),
      'actor'
    )
  ).resolves.toBeUndefined();
});

it('never looks up consent for a browser session', async () => {
  await expect(
    requireMeetAiDataConsent(request(), 'actor')
  ).resolves.toBeUndefined();
  expect(mocks.has).not.toHaveBeenCalled();
});
