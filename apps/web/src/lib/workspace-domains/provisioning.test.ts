import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareApiError,
  type CloudflareDomainsClient,
  workerRouteMatchesHost,
} from './cloudflare';
import {
  attachWorkerRoute,
  coveringWildcardNames,
  HostnameInUseError,
  provisionPlatformSubdomain,
} from './provisioning';

function zone({
  records = {} as Record<string, string[]>,
  routes = [] as string[],
} = {}) {
  return {
    listDnsRecords: vi.fn(async (name: string) =>
      (records[name] ?? []).map((type, index) => ({
        id: `${name}-${index}`,
        type,
        name,
      }))
    ),
    listWorkerRoutes: vi.fn(async () =>
      routes.map((pattern, index) => ({ id: `r${index}`, pattern }))
    ),
    createPlatformRecord: vi.fn(async () => 'dns-new'),
    createWorkerRoute: vi.fn(async () => 'route-new'),
    deleteDnsRecord: vi.fn(async () => undefined),
    deleteWorkerRoute: vi.fn(async () => undefined),
    createCustomHostname: vi.fn(),
    getCustomHostname: vi.fn(),
    deleteCustomHostname: vi.fn(),
  } satisfies CloudflareDomainsClient;
}

async function claimOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HostnameInUseError);
  return (error as HostnameInUseError).claim;
}

describe('workerRouteMatchesHost', () => {
  it.each([
    ['phuc.ttr.gg/*', true],
    ['https://phuc.ttr.gg/blog*', true],
    ['*.ttr.gg/*', true],
    ['*ttr.gg/*', true],
    ['*/*', true],
    ['other.ttr.gg/*', false],
    ['ttr.gg/*', false],
    ['*.phuc.ttr.gg/*', false],
  ])('%s -> %s', (pattern, expected) => {
    expect(workerRouteMatchesHost(pattern, 'phuc.ttr.gg')).toBe(expected);
  });
});

describe('coveringWildcardNames', () => {
  it('lists wildcards from the parent up to the zone', () => {
    expect(coveringWildcardNames('phuc.ttr.gg', 'ttr.gg')).toEqual([
      '*.ttr.gg',
    ]);
    expect(coveringWildcardNames('a.b.ttr.gg', 'ttr.gg')).toEqual([
      '*.b.ttr.gg',
      '*.ttr.gg',
    ]);
  });
});

describe('provisionPlatformSubdomain', () => {
  it('refuses an existing record of any type', async () => {
    const cloudflare = zone({ records: { 'vhp.ttr.gg': ['TXT'] } });
    expect(
      await claimOf(
        provisionPlatformSubdomain(cloudflare, 'vhp.ttr.gg', 'ttr.gg')
      )
    ).toBe('dns_record');
    expect(cloudflare.createPlatformRecord).not.toHaveBeenCalled();
  });

  it('refuses a covering wildcard record', async () => {
    const cloudflare = zone({ records: { '*.ttr.gg': ['CNAME'] } });
    expect(
      await claimOf(
        provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', 'ttr.gg')
      )
    ).toBe('wildcard_dns_record');
  });

  it.each([['phuc.ttr.gg/*'], ['*.ttr.gg/*'], ['*ttr.gg/*']])(
    'refuses an existing route %s',
    async (pattern) => {
      const cloudflare = zone({ routes: [pattern] });
      expect(
        await claimOf(
          provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', 'ttr.gg')
        )
      ).toBe('worker_route');
      expect(cloudflare.createPlatformRecord).not.toHaveBeenCalled();
    }
  );

  it('rolls back the record when the route create conflicts', async () => {
    const cloudflare = zone();
    cloudflare.createWorkerRoute.mockRejectedValue(
      new CloudflareApiError(400, [10020])
    );
    expect(
      await claimOf(
        provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', 'ttr.gg')
      )
    ).toBe('provider_conflict');
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledWith('dns-new');
  });

  it('treats a DNS create conflict as a claim without creating a route', async () => {
    const cloudflare = zone();
    cloudflare.createPlatformRecord.mockRejectedValue(
      new CloudflareApiError(400, [81057])
    );
    expect(
      await claimOf(
        provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', 'ttr.gg')
      )
    ).toBe('provider_conflict');
    expect(cloudflare.createWorkerRoute).not.toHaveBeenCalled();
    expect(cloudflare.deleteDnsRecord).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows non-conflict failures', async () => {
    const cloudflare = zone();
    cloudflare.createWorkerRoute.mockRejectedValue(
      new CloudflareApiError(500, [])
    );
    await expect(
      provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', 'ttr.gg')
    ).rejects.toBeInstanceOf(CloudflareApiError);
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledWith('dns-new');
  });

  it('creates both on a free name', async () => {
    expect(
      await provisionPlatformSubdomain(zone(), 'phuc.ttr.gg', 'ttr.gg')
    ).toEqual({
      dnsRecordId: 'dns-new',
      routeId: 'route-new',
    });
  });
});

describe('platform apex', () => {
  it('refuses every platform subdomain when no apex is configured', async () => {
    const cloudflare = zone();
    expect(
      await claimOf(provisionPlatformSubdomain(cloudflare, 'phuc.ttr.gg', null))
    ).toBe('platform_disabled');
    expect(cloudflare.listDnsRecords).not.toHaveBeenCalled();
  });

  it('checks wildcards under a configured apex', async () => {
    const cloudflare = zone({ records: { '*.sites.example.net': ['A'] } });
    expect(
      await claimOf(
        provisionPlatformSubdomain(
          cloudflare,
          'phuc.sites.example.net',
          'sites.example.net'
        )
      )
    ).toBe('wildcard_dns_record');
  });
});

describe('attachWorkerRoute', () => {
  it('refuses a host another route owns and maps duplicates to claims', async () => {
    expect(
      await claimOf(
        attachWorkerRoute(zone({ routes: ['example.com/*'] }), 'example.com')
      )
    ).toBe('worker_route');
    const duplicate = zone();
    duplicate.createWorkerRoute.mockRejectedValue(
      new CloudflareApiError(409, [])
    );
    expect(await claimOf(attachWorkerRoute(duplicate, 'example.com'))).toBe(
      'provider_conflict'
    );
  });
});

describe('CloudflareApiError.conflict', () => {
  it('recognises already-exists answers', () => {
    expect(new CloudflareApiError(400, [81053]).conflict).toBe(true);
    expect(new CloudflareApiError(400, [], true).conflict).toBe(true);
    expect(new CloudflareApiError(403, [10000]).conflict).toBe(false);
  });
});
