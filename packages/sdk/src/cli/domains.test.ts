import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { domainsHelp, runDomainsCommand } from './domains';
import { getHelpOutput } from './help';

const WS = '2e627dd0-3b4b-472e-b6de-3fb4b767a775';
const domain = {
  id: 'd1',
  hostname: 'example.com',
  kind: 'custom',
  status: 'pending_verification',
  ownershipStatus: 'pending',
  sslStatus: null,
  entitlementSource: 'staff_bypass',
  error: 'ownership_txt_missing',
  ownershipRecord: {
    type: 'TXT',
    name: '_tuturuuu-verify.example.com',
    value: 'tuturuuu-domain-verification=abc',
  },
  routingRecord: { type: 'CNAME', name: 'example.com', value: 'saas.ttr.gg' },
  providerRecords: [],
  createdAt: '2026-11-11T00:00:00.000Z',
  lastCheckedAt: null,
  activatedAt: null,
};
const overview = {
  domains: [domain],
  entitlement: {
    allowed: true,
    reason: 'ok',
    source: 'staff_bypass',
    cap: 10,
    used: 1,
    total: 10,
    remaining: 9,
  },
  billing: { checkoutEnabled: false, pricePerDomainMonthlyUsd: 10 },
  cnameTarget: 'saas.ttr.gg',
  providerConfigured: true,
  canManage: true,
};

function fixture(json = true) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'DELETE') {
        return Response.json({
          id: 'd1',
          hostname: 'example.com',
          providerCleanupPending: false,
        });
      }
      if (url.endsWith('/verify') || init?.method === 'POST') {
        return Response.json({ domain: { ...domain, status: 'active' } });
      }
      return Response.json(overview);
    });
  const client = new TuturuuuUserClient({
    accessToken: 'test-only-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const run = (
    positionals: string[],
    flags: Record<string, string | boolean> = {}
  ) => runDomainsCommand({ client, flags, json, positionals, workspaceId: WS });
  const calls = () =>
    fetch.mock.calls.map(([input, init]) => [
      init?.method ?? 'GET',
      String(input),
    ]);
  return { calls, fetch, output, run };
}

afterEach(() => vi.restoreAllMocks());

describe('ttr domains', () => {
  it('lists through the authenticated workspace API as JSON', async () => {
    const { run, fetch, output, calls } = fixture();
    await run(['list']);
    expect(calls()).toEqual([
      ['GET', `https://tuturuuu.com/api/v1/workspaces/${WS}/domains`],
    ]);
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')
    ).toBe('Bearer test-only-token');
    const printed = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(printed.domains[0].hostname).toBe('example.com');
  });

  it('prints DNS instructions in text mode', async () => {
    const { run, output } = fixture(false);
    await run(['list']);
    const text = String(output.mock.calls[0]?.[0]);
    expect(text).toContain('Domains: 1/10 (staff_bypass)');
    expect(text).toContain('_tuturuuu-verify.example.com');
    expect(text).toContain('saas.ttr.gg');
  });

  it('adds a normalized hostname', async () => {
    const { run, fetch } = fixture();
    await run(['add', 'Example.COM.']);
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      hostname: 'example.com',
    });
  });

  it('verifies by hostname', async () => {
    const { run, calls } = fixture();
    await run(['verify', 'example.com']);
    expect(calls()).toEqual([
      ['GET', `https://tuturuuu.com/api/v1/workspaces/${WS}/domains`],
      [
        'POST',
        `https://tuturuuu.com/api/v1/workspaces/${WS}/domains/d1/verify`,
      ],
    ]);
  });

  it('requires --confirm with the hostname before removing', async () => {
    const { run, fetch, calls } = fixture();
    await expect(run(['remove', 'example.com'])).rejects.toThrow(
      '--confirm example.com'
    );
    await expect(
      run(['remove', 'example.com'], { confirm: 'other.com' })
    ).rejects.toThrow('--confirm example.com');
    expect(fetch).not.toHaveBeenCalled();
    await run(['remove', 'example.com'], { confirm: 'example.com' });
    expect(calls().at(-1)).toEqual([
      'DELETE',
      `https://tuturuuu.com/api/v1/workspaces/${WS}/domains/d1`,
    ]);
  });

  it('rejects unknown hosts and actions', async () => {
    const { run } = fixture();
    await expect(run(['verify', 'missing.example'])).rejects.toThrow(
      'not found'
    );
    await expect(run(['transfer', 'example.com'])).rejects.toThrow(
      'Unknown domains command'
    );
  });

  it('documents the commands in help', () => {
    expect(getHelpOutput('domains')).toBe(domainsHelp());
    expect(domainsHelp()).toContain('--confirm <hostname>');
    expect(getHelpOutput()).toContain('domains <list|add|verify|remove>');
  });
});
