import { describe, expect, it, vi } from 'vitest';
import { fixtures } from './test-fixtures';
import {
  fleetApiOptions,
  readFleetAccess,
  readFleetDigest,
  readFleetIntents,
  refusalOf,
  sendFleetIntent,
} from './upstream';

function upstream(body: unknown, status = 200, headers?: HeadersInit) {
  return vi.fn(
    async (_request: RequestInfo | URL) =>
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      })
  );
}

const token = 'session-token';
const request = (fetch: ReturnType<typeof upstream>) =>
  fetch.mock.calls[0]?.[0] as Request;

describe('Fleet upstream', () => {
  it('sends only the caller bearer to tuturuuu.com without following redirects', async () => {
    const fetch = upstream(fixtures.observer);
    await readFleetAccess(fleetApiOptions(token, fetch));
    const sent = request(fetch);
    expect(sent.url).toBe('https://tuturuuu.com/api/v1/fleet/access');
    expect(sent.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(sent.headers.get('Cookie')).toBeNull();
    expect(sent.redirect).toBe('manual');
  });

  it('refuses redirect responses before reading them', async () => {
    const fetch = upstream(null, 302, { Location: 'https://evil.example' });
    await expect(
      readFleetAccess(fleetApiOptions(token, fetch))
    ).rejects.toThrow();
    const write = await sendFleetIntent(
      { kind: 'lane.pause', payload: { projectKey: 'web', targetKey: 'a' } },
      fleetApiOptions(token, fetch)
    );
    expect(write).toEqual({ kind: 'refused', reason: 'unavailable' });
  });

  it('turns 401 and 403 reads into a denied state', async () => {
    for (const status of [401, 403]) {
      const fetch = upstream({ error: 'forbidden' }, status);
      await expect(
        readFleetDigest(fleetApiOptions(token, fetch))
      ).resolves.toEqual({ kind: 'denied' });
    }
  });

  it('rejects responses outside the contract', async () => {
    const leaky = upstream({ ...fixtures.observer, email: 'a@b.c' });
    await expect(
      readFleetAccess(fleetApiOptions(token, leaky))
    ).rejects.toThrow();
    const extraLane = upstream({
      sections: [
        {
          ...fixtures.digest.sections[0],
          lanes: [
            { lane: 'Search', state: 'running', blockerCodes: [], host: 'x' },
          ],
        },
      ],
      totals: fixtures.digest.totals,
    });
    await expect(
      readFleetDigest(fleetApiOptions(token, extraLane))
    ).rejects.toThrow();
  });

  it('recomputes digest totals from validated sections', async () => {
    const fetch = upstream({
      sections: fixtures.digest.sections,
      totals: { projects: 99, lanes: 99, byState: {} },
    });
    const result = await readFleetDigest(fleetApiOptions(token, fetch));
    expect(result.kind === 'ok' && result.data.totals).toEqual(
      fixtures.digest.totals
    );
  });

  it('pages receipts with the cursor', async () => {
    const fetch = upstream({ intents: [], nextBefore: null });
    const before = '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
    await readFleetIntents(before, fleetApiOptions(token, fetch));
    expect(request(fetch).url).toBe(
      `https://tuturuuu.com/api/v1/fleet/intents?before=${before}`
    );
  });

  it('maps API refusals to typed reasons', async () => {
    const fetch = upstream({ error: 'intents_per_day' }, 429);
    await expect(
      sendFleetIntent(
        { kind: 'lane.pause', payload: { projectKey: 'web', targetKey: 'a' } },
        fleetApiOptions(token, fetch)
      )
    ).resolves.toEqual({ kind: 'refused', reason: 'intents_per_day' });
    const error = (status: number, message = '') =>
      Object.assign(new Error(message), { status });
    expect(refusalOf(error(403, 'project_outside_grant'))).toBe(
      'project_outside_grant'
    );
    expect(refusalOf(error(403, 'raw upstream text'))).toBe('forbidden');
    expect(refusalOf(error(409))).toBe('conflict');
    expect(refusalOf(error(400))).toBe('invalid');
    expect(refusalOf(error(503))).toBe('unavailable');
  });
});
