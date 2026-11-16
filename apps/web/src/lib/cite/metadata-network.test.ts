import { Agent } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchMetadataText,
  isGlobalMetadataAddress,
  METADATA_MAX_BYTES,
  type MetadataNetwork,
} from './metadata-network';

vi.mock('server-only', () => ({}));
const target = new URL('https://api.crossref.org/works/10.5555%2Ftest');

function networkFor(response = Response.json({ message: {} })) {
  const agent = new Agent();
  const destroy = vi.spyOn(agent, 'destroy');
  const network: MetadataNetwork = {
    resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
    dispatcher: vi.fn(() => agent),
    fetch: vi.fn(async () => response),
    timeoutMs: 20,
  };
  return { network, destroy, agent };
}

describe('bounded citation network', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.31.2.3',
    '192.168.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '198.51.100.2',
    '198.18.0.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    'not-an-ip',
  ])('rejects non-global address %s', (ip) => {
    expect(isGlobalMetadataAddress(ip)).toBe(false);
  });

  it('pins the admitted public address and sends no credentials', async () => {
    const { network, destroy, agent } = networkFor();
    expect(await fetchMetadataText(target, 'json', network)).toBe(
      '{"message":{}}'
    );
    expect(network.resolve).toHaveBeenCalledTimes(1);
    expect(network.dispatcher).toHaveBeenCalledWith(
      '93.184.216.34',
      'api.crossref.org'
    );
    expect(network.fetch).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Tuturuuu-Cite/1.0',
          Host: 'api.crossref.org',
        },
      })
    );
    expect(destroy.mock.calls.filter((args) => args.length === 0)).toHaveLength(
      1
    );
    expect(agent.destroyed).toBe(true);
  });

  it.each([
    '127.42.1.2',
    '10.1.2.3',
    '172.16.2.3',
    '192.168.1.2',
    '169.254.169.254',
    '100.64.0.1',
    '0.1.2.3',
    '224.1.2.3',
    '::1',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects post-DNS non-global class %s before connect', async (address) => {
    const { network } = networkFor();
    network.resolve = vi.fn(async () => [
      { address, family: address.includes(':') ? 6 : 4 },
    ]);
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(network.dispatcher).not.toHaveBeenCalled();
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'application/json-evil',
    'text/html; application/json',
    'x-application/json',
    'application/json, text/html',
  ])('requires exact JSON media type %s', async (contentType) => {
    const { network } = networkFor(
      new Response('{}', { headers: { 'content-type': contentType } })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('accepts exact JSON media type with charset parameter', async () => {
    const { network } = networkFor(
      new Response('{}', {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    );
    expect(await fetchMetadataText(target, 'json', network)).toBe('{}');
  });

  it('requires exact HTML media type', async () => {
    const { network } = networkFor(
      new Response('<title>Synthetic</title>', {
        headers: { 'content-type': 'text/html-evil' },
      })
    );
    await expect(
      fetchMetadataText(new URL('https://arxiv.org/abs/test'), 'html', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('fails closed when DNS returns a mixture of public/private addresses', async () => {
    const { network } = networkFor();
    network.resolve = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ];
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it('rejects unexpected IPv6 and mapped records', async () => {
    const { network } = networkFor();
    network.resolve = async () => [{ address: '::ffff:127.0.0.1', family: 6 }];
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it('rejects redirects without following their destination', async () => {
    const { network } = networkFor(
      new Response('', {
        status: 302,
        headers: { location: 'http://169.254.169.254/' },
      })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it('caps DNS resolution time before creating a connection', async () => {
    const { network } = networkFor();
    network.resolve = () => new Promise(() => {});
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it('caps connection/header wait and destroys its dispatcher', async () => {
    const { network, destroy, agent } = networkFor();
    network.fetch = () => new Promise(() => {});
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(destroy.mock.calls.filter((args) => args.length === 0)).toHaveLength(
      1
    );
    expect(agent.destroyed).toBe(true);
  });

  it('caps a stalled body with the same request deadline and cancels it', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const { network, destroy, agent } = networkFor(
      new Response(stream, { headers: { 'content-type': 'application/json' } })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(destroy.mock.calls.filter((args) => args.length === 0)).toHaveLength(
      1
    );
    expect(agent.destroyed).toBe(true);
  });

  it('rejects oversized streamed data even without a content-length', async () => {
    const { network } = networkFor(
      new Response('x'.repeat(METADATA_MAX_BYTES + 1), {
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('rejects oversized declared content without reading it', async () => {
    const { network } = networkFor(
      new Response('', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(METADATA_MAX_BYTES + 1),
        },
      })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('rejects a non-JSON registry response', async () => {
    const { network } = networkFor(
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      })
    );
    await expect(
      fetchMetadataText(target, 'json', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it.each([
    'https://api.crossref.org.attacker.example/x',
    'http://api.crossref.org/x',
    'https://api.crossref.org:444/x',
    'https://a:b@api.crossref.org/x',
  ])('rejects forbidden target %s before DNS', async (value) => {
    const { network } = networkFor();
    await expect(
      fetchMetadataText(new URL(value), 'json', network)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(network.resolve).not.toHaveBeenCalled();
  });
});
