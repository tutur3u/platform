import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareApiError,
  type CloudflareDnsRecordSummary,
  type CloudflareDomainsClient,
  type CloudflareWorkerRoute,
} from './cloudflare';
import {
  addWorkspaceDomain,
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
  WorkspaceDomainError,
} from './service';

type Row = Record<string, unknown>;

/** In-memory stand-in for the few PostgREST chains the service uses. */
function fakeAdmin(entitlement: Row, staff = true) {
  const domains: Row[] = [];
  const audit: Row[] = [];
  let n = 0;
  const table = (rows: Row[]) => {
    let filters: Array<(row: Row) => boolean> = [];
    let pending: { kind: 'insert' | 'update'; value: Row } | null = null;
    const run = () => {
      if (pending?.kind === 'insert') {
        n += 1;
        const row = {
          id: `00000000-0000-4000-8000-00000000000${n}`,
          status: 'pending_verification',
          created_at: new Date(n).toISOString(),
          dns_records: [],
          ssl_status: null,
          cloudflare_custom_hostname_id: null,
          cloudflare_dns_record_id: null,
          cloudflare_worker_route_id: null,
          activated_at: null,
          last_checked_at: null,
          error: null,
          ...pending.value,
        };
        rows.push(row);
        return [row];
      }
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (pending?.kind === 'update') {
        for (const row of matched) Object.assign(row, pending.value);
      }
      return matched;
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return chain;
      },
      order: () => chain,
      insert: (value: Row) => {
        pending = { kind: 'insert', value };
        if (rows === audit) rows.push(value);
        return rows === audit ? Promise.resolve({ error: null }) : chain;
      },
      update: (value: Row) => {
        pending = { kind: 'update', value };
        return chain;
      },
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    };
    filters = [];
    return chain;
  };
  const admin = {
    from: () => table(domains),
    rpc: async () => ({ data: staff, error: null }),
    schema: () => ({
      from: (name: string) =>
        name === 'workspace_domain_settings'
          ? {
              select: () => ({
                maybeSingle: async () => ({
                  data: { enabled: true },
                  error: null,
                }),
              }),
            }
          : table(audit),
      rpc: async () => ({ data: entitlement, error: null }),
    }),
  } as unknown as TypedSupabaseClient;
  return { admin, domains, audit };
}

const STAFF_OK = {
  allowed: true,
  reason: 'ok',
  source: 'staff_bypass',
  cap: 10,
  used: 0,
  total: 10,
  remaining: 10,
};
const actor = { id: 'user-1', staffSession: true };
const CONFIG = { platformApex: 'ttr.gg', fallbackOrigin: 'saas.ttr.gg' };

function fakeCloudflare(status = 'active') {
  return {
    listDnsRecords: vi.fn(
      async (_name: string): Promise<CloudflareDnsRecordSummary[]> => []
    ),
    listWorkerRoutes: vi.fn(async (): Promise<CloudflareWorkerRoute[]> => []),
    createCustomHostname: vi.fn(async () => ({
      id: 'ch1',
      hostname: 'example.com',
      status,
      ssl: { status },
    })),
    getCustomHostname: vi.fn(async () => ({
      id: 'ch1',
      hostname: 'example.com',
      status,
      ssl: { status },
    })),
    deleteCustomHostname: vi.fn(async () => undefined),
    createPlatformRecord: vi.fn(async () => 'dns1'),
    deleteDnsRecord: vi.fn(async () => undefined),
    createWorkerRoute: vi.fn(async () => 'route1'),
    deleteWorkerRoute: vi.fn(async () => undefined),
  } satisfies CloudflareDomainsClient;
}

describe('workspace domain service', () => {
  it('fails closed without an apex or fallback origin', async () => {
    const { admin, domains } = fakeAdmin(STAFF_OK);
    const unconfigured = { platformApex: null, fallbackOrigin: null };
    await expect(
      addWorkspaceDomain(
        { admin, cloudflare: fakeCloudflare(), config: unconfigured },
        'ws',
        actor,
        'phuc.ttr.gg'
      )
    ).rejects.toMatchObject({ status: 400, code: 'hostname_reserved' });
    await expect(
      addWorkspaceDomain(
        { admin, cloudflare: null, config: unconfigured },
        'ws',
        actor,
        'example.com'
      )
    ).rejects.toMatchObject({
      status: 503,
      code: 'custom_domains_unconfigured',
    });
    expect(domains).toHaveLength(0);
  });

  it('shows the configured fallback origin in DNS instructions', async () => {
    const { admin } = fakeAdmin(STAFF_OK);
    const domain = await addWorkspaceDomain(
      {
        admin,
        cloudflare: null,
        config: { platformApex: null, fallbackOrigin: 'edge.example.net' },
      },
      'ws',
      actor,
      'example.com'
    );
    expect(domain.routingRecord).toEqual({
      type: 'CNAME',
      name: 'example.com',
      value: 'edge.example.net',
    });
  });

  it('rejects reserved hostnames before any lookup', async () => {
    const { admin } = fakeAdmin(STAFF_OK);
    await expect(
      addWorkspaceDomain(
        { admin, cloudflare: null, config: CONFIG },
        'ws',
        actor,
        'www.ttr.gg'
      )
    ).rejects.toMatchObject({ status: 400, code: 'hostname_reserved' });
  });

  it('denies and audits when the workspace is not entitled', async () => {
    const { admin, audit, domains } = fakeAdmin({
      ...STAFF_OK,
      allowed: false,
      reason: 'billing_unavailable',
      source: null,
    });
    const error = await addWorkspaceDomain(
      { admin, cloudflare: null, config: CONFIG },
      'ws',
      actor,
      'example.com'
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkspaceDomainError);
    expect(error).toMatchObject({
      status: 403,
      code: 'entitlement_billing_unavailable',
    });
    expect(domains).toHaveLength(0);
    expect(audit[0]).toMatchObject({ action: 'denied' });
  });

  it('provisions a platform subdomain straight to active', async () => {
    const { admin, domains } = fakeAdmin(STAFF_OK);
    const cloudflare = fakeCloudflare();
    const domain = await addWorkspaceDomain(
      { admin, cloudflare, config: CONFIG },
      'ws',
      actor,
      'Phuc.ttr.gg'
    );
    expect(domain).toMatchObject({
      hostname: 'phuc.ttr.gg',
      kind: 'platform_subdomain',
      status: 'active',
      ownershipRecord: null,
    });
    expect(cloudflare.createPlatformRecord).toHaveBeenCalledWith('phuc.ttr.gg');
    expect(cloudflare.createWorkerRoute).toHaveBeenCalledWith('phuc.ttr.gg');
    expect(domains[0]).toMatchObject({ entitlement_source: 'staff_bypass' });
  });

  it('refuses a platform subdomain the zone already answers for, before any row', async () => {
    const { admin, domains, audit } = fakeAdmin(STAFF_OK);
    const cloudflare = fakeCloudflare();
    cloudflare.listDnsRecords.mockImplementation(async (name: string) =>
      name === 'taken.ttr.gg' ? [{ id: 'x', type: 'A', name }] : []
    );
    await expect(
      addWorkspaceDomain(
        { admin, cloudflare, config: CONFIG },
        'ws',
        actor,
        'taken.ttr.gg'
      )
    ).rejects.toMatchObject({ status: 409, code: 'hostname_in_use' });
    expect(domains).toHaveLength(0);
    expect(cloudflare.createPlatformRecord).not.toHaveBeenCalled();
    expect(audit[0]).toMatchObject({
      action: 'denied',
      detail: { reason: 'hostname_in_use', claim: 'dns_record' },
    });
  });

  it('records a provisioning conflict without leaving provider state', async () => {
    const { admin, domains } = fakeAdmin(STAFF_OK);
    const cloudflare = fakeCloudflare();
    cloudflare.createWorkerRoute.mockRejectedValue(
      new CloudflareApiError(409, [10020])
    );
    await expect(
      addWorkspaceDomain(
        { admin, cloudflare, config: CONFIG },
        'ws',
        actor,
        'race.ttr.gg'
      )
    ).rejects.toMatchObject({ status: 409, code: 'hostname_in_use' });
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledWith('dns1');
    expect(domains[0]).toMatchObject({
      status: 'pending_verification',
      error: 'hostname_in_use',
      cloudflare_dns_record_id: null,
      cloudflare_worker_route_id: null,
    });
  });

  it('keeps a custom hostname pending until the ownership TXT exists', async () => {
    const { admin } = fakeAdmin(STAFF_OK);
    const cloudflare = fakeCloudflare();
    const added = await addWorkspaceDomain(
      { admin, cloudflare, config: CONFIG },
      'ws',
      actor,
      'example.com'
    );
    expect(added.ownershipRecord?.name).toBe('_tuturuuu-verify.example.com');

    const noRecord = vi.fn(async () =>
      Response.json({ Status: 3, Answer: [] })
    );
    const pending = await verifyWorkspaceDomain(
      { admin, cloudflare, config: CONFIG, fetch: noRecord },
      'ws',
      actor,
      added.id
    );
    expect(pending).toMatchObject({
      status: 'pending_verification',
      error: 'ownership_txt_missing',
    });
    expect(cloudflare.createCustomHostname).not.toHaveBeenCalled();

    const withRecord = vi.fn(async () =>
      Response.json({
        Status: 0,
        Answer: [{ type: 16, data: `"${added.ownershipRecord?.value}"` }],
      })
    );
    const active = await verifyWorkspaceDomain(
      { admin, cloudflare, config: CONFIG, fetch: withRecord },
      'ws',
      actor,
      added.id
    );
    expect(active).toMatchObject({ status: 'active', sslStatus: 'active' });

    // Re-verifying reuses the provider resources.
    await verifyWorkspaceDomain(
      { admin, cloudflare, config: CONFIG, fetch: withRecord },
      'ws',
      actor,
      added.id
    );
    expect(cloudflare.createCustomHostname).toHaveBeenCalledTimes(1);
    expect(cloudflare.createWorkerRoute).toHaveBeenCalledTimes(1);

    const removed = await removeWorkspaceDomain(
      { admin, cloudflare, config: CONFIG },
      'ws',
      actor,
      added.id
    );
    expect(removed.providerCleanupPending).toBe(false);
    expect(cloudflare.deleteWorkerRoute).toHaveBeenCalledWith('route1');
    expect(cloudflare.deleteCustomHostname).toHaveBeenCalledWith('ch1');
  });

  it('suspends a staff-bypass domain whose creator is no longer staff', async () => {
    const { admin, domains } = fakeAdmin(STAFF_OK, false);
    domains.push({
      id: '00000000-0000-4000-8000-0000000000aa',
      ws_id: 'ws',
      hostname: 'example.com',
      kind: 'custom',
      status: 'active',
      entitlement_source: 'staff_bypass',
      created_by: 'user-1',
    });
    const result = await verifyWorkspaceDomain(
      { admin, cloudflare: fakeCloudflare(), config: CONFIG },
      'ws',
      actor,
      '00000000-0000-4000-8000-0000000000aa'
    );
    expect(result).toMatchObject({
      status: 'suspended',
      error: 'entitlement_lapsed',
    });
  });
});
