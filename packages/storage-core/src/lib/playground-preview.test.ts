import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  playgroundCapabilityResponse,
  playgroundPreviewResponse,
} from './playground-preview';
import {
  rewritePreviewAsset,
  rewritePreviewHtml,
} from './playground-preview-assets';
import {
  previewCapabilityPrefix,
  readPreviewCapability,
} from './playground-preview-capability';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), result: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./playground-service', () => ({
  executePlayground: mocks.execute,
  getPlaygroundRun: mocks.result,
}));
const ownerId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const roomId = '00000000-0000-4000-8000-000000000003';
const input = {
  ownerId,
  projectId,
  port: 3000,
  prefix: `/api/v1/users/me/playgrounds/${projectId}/preview/3000/`,
};
function preview(contentType: string, source: string) {
  mocks.result.mockResolvedValue({
    status: 'succeeded',
    preview: JSON.stringify({
      status: 200,
      contentType,
      body: Buffer.from(source).toString('base64'),
    }),
  });
}
beforeEach(() => {
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', 'disposable-fixture-secret');
  mocks.execute.mockReset().mockResolvedValue({ runId: 'fixture' });
  mocks.result.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it('loads module assets from an opaque iframe using only the scoped capability', async () => {
  preview('text/html', '<script type="module" src="/src/main.js"></script>');
  const html = await (
    await playgroundPreviewResponse({ ...input, path: '/' })
  ).text();
  const prefix = html.match(/<base href="([^"]+)"/)![1]!;
  expect(html).toContain(`src="${prefix}src/main.js"`);
  const token = prefix.split('/_ttr-preview/')[1]!.split('/')[0]!;
  expect(readPreviewCapability(token, { projectId, port: 3000 }).ownerId).toBe(
    ownerId
  );
  preview('application/javascript', 'import value from "/src/helper.js";');
  const result = await playgroundCapabilityResponse({
    request: new Request('http://localhost/asset'),
    projectId,
    port: 3000,
    prefix: input.prefix,
    path: ['_ttr-preview', token, 'src', 'main.js'],
  });
  expect(result?.status).toBe(200);
  expect(await result?.text()).toContain(`from "${prefix}src/helper.js"`);
  expect(mocks.execute.mock.calls.at(-1)?.[4]).toEqual({
    port: 3000,
    path: '/src/main.js',
  });
  expect(result?.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(result?.headers.get('Set-Cookie')).toBeNull();
});
it('denies expired, altered, wrong-project, wrong-port and wrong-room capabilities before running a job', async () => {
  vi.useFakeTimers();
  const prefix = previewCapabilityPrefix({ ...input, roomId });
  const token = prefix.split('/_ttr-preview/')[1]!.split('/')[0]!;
  for (const scope of [
    { port: 3001, roomId },
    { port: 3000 },
    { port: 3000, roomId, projectId: ownerId },
  ]) {
    expect(() => readPreviewCapability(token, scope)).toThrow();
  }
  expect(() =>
    readPreviewCapability(`${token}a`, { port: 3000, roomId })
  ).toThrow();
  vi.advanceTimersByTime(61000);
  const denied = await playgroundCapabilityResponse({
    request: new Request('http://localhost/asset'),
    port: 3000,
    roomId,
    prefix: input.prefix,
    path: ['_ttr-preview', token],
  });
  expect(denied?.status).toBe(403);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('keeps native loopback capability prefixes and binary assets intact', async () => {
  const prefix = `http://127.0.0.1:4567/${'a'.repeat(64)}/preview/3000/`;
  expect(previewCapabilityPrefix({ ...input, prefix })).toBe(prefix);
  const bytes = Buffer.from([0, 255, 128, 17]);
  preview('image/png', '');
  mocks.result.mockResolvedValue({
    status: 'succeeded',
    preview: JSON.stringify({
      status: 200,
      contentType: 'image/png',
      body: bytes.toString('base64'),
    }),
  });
  expect(
    Buffer.from(
      await (
        await playgroundPreviewResponse({ ...input, prefix, path: '/logo.png' })
      ).arrayBuffer()
    )
  ).toEqual(bytes);
});
it('rebases static/dynamic imports and CSS URLs without changing relative or external URLs', () => {
  expect(
    rewritePreviewAsset(
      'import "/a.js"; import("/b.js"); import "./c.js"; import "//other/a.js";',
      'text/javascript',
      '/private/'
    )
  ).toBe(
    'import "/private/a.js"; import("/private/b.js"); import "./c.js"; import "//other/a.js";'
  );
  expect(
    rewritePreviewAsset(
      '@import "/a.css"; body{background:url(/a.png)}',
      'text/css',
      '/private/'
    )
  ).toBe('@import "/private/a.css"; body{background:url(/private/a.png)}');
});

it('bounds rewritten response bytes before capability expansion can amplify egress', () => {
  const source = '<script src="/asset.js"></script>'.repeat(15000);
  expect(() =>
    rewritePreviewHtml(source, `/private/${'a'.repeat(1000)}/`)
  ).toThrow('limit');
  expect(() =>
    rewritePreviewAsset(
      'import "/module.js";'.repeat(20000),
      'text/javascript',
      `/private/${'a'.repeat(1000)}/`
    )
  ).toThrow('limit');
});
