import { describe, expect, it, vi } from 'vitest';
import {
  confirmFleetLink,
  createFleetLinkCode,
  fleetIntentPageSchema,
  fleetLinkConfirmationSchema,
  listFleetIntents,
  submitFleetIntent,
} from './fleet';

const intentId = '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function recorder(body: unknown, status = 200) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

const baseUrl = 'https://tuturuuu.com';

describe('Fleet clients', () => {
  it('lists receipts with an optional cursor', async () => {
    const fetch = recorder({ intents: [], nextBefore: null });
    await listFleetIntents(undefined, { baseUrl, fetch });
    await listFleetIntents(intentId, { baseUrl, fetch });

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://tuturuuu.com/api/v1/fleet/intents'
    );
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      `https://tuturuuu.com/api/v1/fleet/intents?before=${intentId}`
    );
    expect(fetch.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('posts typed intents and link requests as JSON', async () => {
    const fetch = recorder({ id: intentId }, 201);
    const intent = {
      kind: 'priority.set' as const,
      payload: { projectKey: 'web', targetKey: 'lane-a', priority: 'high' },
    } as const;
    await submitFleetIntent(intent, { baseUrl, fetch });
    await createFleetLinkCode({ baseUrl, fetch });
    await confirmFleetLink(
      { linkId: intentId, confirmationCode: 'a'.repeat(43), preview: true },
      { baseUrl, fetch }
    );

    const [submit, code, confirm] = fetch.mock.calls;
    expect(String(submit?.[0])).toBe(
      'https://tuturuuu.com/api/v1/fleet/intents'
    );
    expect(submit?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(submit?.[1]?.body))).toEqual(intent);
    expect(String(code?.[0])).toBe(
      'https://tuturuuu.com/api/v1/fleet/identity/link-codes'
    );
    expect(code?.[1]?.body).toBe('{}');
    expect(String(confirm?.[0])).toBe(
      'https://tuturuuu.com/api/v1/fleet/identity/confirm'
    );
    expect(JSON.parse(String(confirm?.[1]?.body))).toMatchObject({
      preview: true,
    });
  });

  it('rethrows API refusals with their status', async () => {
    const fetch = recorder({ error: 'intents_per_day' }, 429);
    await expect(
      submitFleetIntent(
        {
          kind: 'lane.pause',
          payload: { projectKey: 'web', targetKey: 'lane-a' },
        },
        { baseUrl, fetch }
      )
    ).rejects.toMatchObject({ status: 429 });
  });

  it('rejects receipts and link displays outside the contract', () => {
    expect(
      fleetIntentPageSchema.safeParse({
        intents: [],
        nextBefore: null,
        actorId: intentId,
      }).success
    ).toBe(false);
    expect(
      fleetLinkConfirmationSchema.safeParse({
        linked: true,
        channel: 'sms',
        accountLabel: 'Desk',
      }).success
    ).toBe(false);
  });
});
