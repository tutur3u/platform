import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareApiError,
  cloudflareDomainsConfigFromEnv,
  createCloudflareDomainsClient,
  customHostnameDnsRecords,
  WORKSPACE_DOMAINS_WORKER_SCRIPT,
} from './cloudflare';

const ZONE = 'a'.repeat(32);
const config = cloudflareDomainsConfigFromEnv({
  CLOUDFLARE_SAAS_API_TOKEN: 'token-value',
  CLOUDFLARE_SAAS_ZONE_ID: ZONE,
});

function ok(result: unknown) {
  return Response.json({ success: true, result });
}

describe('cloudflareDomainsConfigFromEnv', () => {
  it('requires a token and a zone id', () => {
    expect(cloudflareDomainsConfigFromEnv({})).toBeNull();
    expect(
      cloudflareDomainsConfigFromEnv({
        CLOUDFLARE_SAAS_API_TOKEN: 't',
        CLOUDFLARE_SAAS_ZONE_ID: 'not-a-zone',
      })
    ).toBeNull();
    expect(config).toMatchObject({
      zoneId: ZONE,
      sslMethod: 'http',
      workerScript: WORKSPACE_DOMAINS_WORKER_SCRIPT,
    });
  });
});

describe('createCloudflareDomainsClient', () => {
  it('creates custom hostnames with DV certificates', async () => {
    const fetchMock = vi.fn(async () => ok({ id: 'ch1', status: 'pending' }));
    const client = createCloudflareDomainsClient(config!, fetchMock);
    await client.createCustomHostname('example.com');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames`
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      hostname: 'example.com',
      ssl: { method: 'http', type: 'dv' },
    });
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer token-value'
    );
  });

  it('attaches a route pattern for the edge Worker', async () => {
    const fetchMock = vi.fn(async () => ok({ id: 'r1' }));
    const client = createCloudflareDomainsClient(config!, fetchMock);
    expect(await client.createWorkerRoute('phuc.ttr.gg')).toBe('r1');
    const init = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(JSON.parse(init.body as string)).toEqual({
      pattern: 'phuc.ttr.gg/*',
      script: WORKSPACE_DOMAINS_WORKER_SCRIPT,
    });
  });

  it('treats deleting a missing resource as done and hides provider bodies', async () => {
    const missing = vi.fn(async () =>
      Response.json(
        { success: false, errors: [{ code: 1551, message: 'secret' }] },
        { status: 404 }
      )
    );
    await expect(
      createCloudflareDomainsClient(config!, missing).deleteDnsRecord('x')
    ).resolves.toBeUndefined();

    const failing = vi.fn(async () =>
      Response.json(
        { success: false, errors: [{ code: 10000, message: 'token bad' }] },
        { status: 403 }
      )
    );
    const error = await createCloudflareDomainsClient(config!, failing)
      .getCustomHostname('x')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudflareApiError);
    expect((error as CloudflareApiError).codes).toEqual([10000]);
    expect(String(error)).not.toContain('token');
  });
});

describe('customHostnameDnsRecords', () => {
  it('lists ownership and certificate TXT records', () => {
    expect(
      customHostnameDnsRecords({
        id: 'x',
        hostname: 'example.com',
        status: 'pending',
        ownership_verification: {
          type: 'txt',
          name: '_cf-custom-hostname.example.com',
          value: 'abc',
        },
        ssl: {
          validation_records: [
            { txt_name: '_acme-challenge.example.com', txt_value: 'def' },
            { http_url: 'http://example.com/.well-known/x', http_body: 'y' },
          ],
        },
      })
    ).toEqual([
      { type: 'TXT', name: '_cf-custom-hostname.example.com', value: 'abc' },
      { type: 'TXT', name: '_acme-challenge.example.com', value: 'def' },
    ]);
  });
});
