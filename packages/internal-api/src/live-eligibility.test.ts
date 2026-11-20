import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './internal-api-error';
import {
  getLiveEligibility,
  LiveBlockedError,
  readLiveEligibility,
} from './live-eligibility';
import { createLiveSession } from './live-tools';

const blockedBody = {
  code: 'LIVE_BLOCKED',
  eligible: false,
  reason: 'plan_required',
  tier: 'FREE',
  billing: { name: 'Acme', personal: false },
  params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
  error: 'server text that clients must not show',
};

describe('getLiveEligibility', () => {
  it('sends the access workspace and credit source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...blockedBody, code: undefined }), {
        status: 200,
      })
    );
    await expect(
      getLiveEligibility(
        { wsId: 'ws-1', creditSource: 'workspace', creditWsId: 'ws-1' },
        { fetch: fetchMock }
      )
    ).resolves.toMatchObject({
      eligible: false,
      reason: 'plan_required',
      billing: { name: 'Acme', personal: false },
    });
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string, 'http://x');
    expect(url.pathname).toBe('/api/v1/live/eligibility');
    expect(url.searchParams.get('wsId')).toBe('ws-1');
    expect(url.searchParams.get('creditSource')).toBe('workspace');
    expect(url.searchParams.get('creditWsId')).toBe('ws-1');
  });

  it('rejects an unknown wire shape', () => {
    expect(readLiveEligibility({ eligible: false, reason: 'region' })).toBe(
      null
    );
    expect(readLiveEligibility(null)).toBe(null);
  });
});

describe('createLiveSession blocked responses', () => {
  it.each([
    ['plan_required', 403],
    ['role_not_allowed', 403],
    ['credits_exhausted', 402],
    ['limit_reached', 429],
    ['paused', 503],
  ])('maps %s (%i) to a LiveBlockedError', async (reason, status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...blockedBody,
          reason,
          params: { plans: [], resetAt: '2026-11-20T10:00:00.000Z' },
        }),
        { status }
      )
    );
    const error = await createLiveSession(
      { creditSource: 'personal', wsId: 'ws-1' },
      { fetch: fetchMock }
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiveBlockedError);
    expect(error).toBeInstanceOf(InternalApiError);
    expect((error as LiveBlockedError).status).toBe(status);
    expect((error as LiveBlockedError).eligibility.reason).toBe(reason);
    expect((error as LiveBlockedError).eligibility.params.resetAt).toBe(
      '2026-11-20T10:00:00.000Z'
    );
    expect((error as Error).message).not.toContain('server text');
  });

  it('keeps other failures as generic internal API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'LIVE_NOT_CONFIGURED', error: 'x' }),
          { status: 503 }
        )
      );
    const error = await createLiveSession(
      { creditSource: 'personal', wsId: 'ws-1' },
      { fetch: fetchMock }
    ).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(LiveBlockedError);
    expect(error).toMatchObject({ code: 'LIVE_NOT_CONFIGURED', status: 503 });
  });
});
