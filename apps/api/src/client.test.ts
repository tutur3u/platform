import { expect, test } from 'bun:test';
import { ApiClient } from '../generated/client';

test('generated TypeScript client encodes the OpenAPI query and reads the forced update gate', async () => {
  let calls = 0;
  const client = new ApiClient('https://fixture.invalid', async (url, init) => {
    calls++;
    expect(url.pathname).toBe('/api/v1/mobile/version');
    expect(url.searchParams.get('platform')).toBe('ios');
    expect(url.searchParams.get('build')).toBe('41');
    expect(init.method).toBe('GET');
    return Response.json({
      platform: 'ios',
      currentBuild: 41,
      minimumSupportedBuild: 42,
      latestBuild: 50,
      storeUrl: 'https://apps.apple.com/app/example',
      requiresUpdate: true,
      shouldUpdate: true,
      status: 'update-required',
    });
  });
  const result = await client.getMobileVersion({
    platform: 'ios',
    build: '41',
  });
  expect(result.requiresUpdate).toBe(true);
  expect(result.minimumSupportedBuild).toBe(42);
  expect(calls).toBe(1);
});

test('generated TypeScript client exposes a failed status and never retries', async () => {
  let calls = 0;
  const client = new ApiClient('https://fixture.invalid', async () => {
    calls++;
    return new Response(null, {
      status: 503,
      headers: { 'x-request-id': 'fixture-request' },
    });
  });
  await expect(client.getHealth()).rejects.toThrow(
    '503; request ID: fixture-request'
  );
  expect(calls).toBe(1);
});
