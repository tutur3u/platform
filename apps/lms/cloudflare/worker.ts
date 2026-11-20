import { type AssetsBinding, fetchAsset } from '@tuturuuu/start-bridge/assets';
import { createBasePath, retarget } from '@tuturuuu/start-bridge/base-path';
import {
  createRootResponsePolicy,
  withHstsResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { LMS_BASE, LMS_ORIGIN, lmsArea, lmsLoginDestination } from './routing';

interface Binding {
  fetch(request: Request): Promise<Response>;
}

export interface LmsEnvironment {
  ASSETS: AssetsBinding;
  TEACH?: Binding;
  LEARN?: Binding;
  TUTURUUU_NOINDEX?: string;
}

const base = createBasePath({ app: 'lms', basePath: LMS_BASE });
const mounts = {
  app: 'lms',
  rootHosts: [],
  mountHosts: ['tuturuuu.com'],
  basePath: LMS_BASE,
  unknownHost: 'reject',
} as const;
const render = createBridgeStartHandler();
const policy = createRootResponsePolicy<LmsEnvironment>({
  seo: ({ request, env }) =>
    env?.TUTURUUU_NOINDEX === '0' &&
    base.strip(new URL(request.url).pathname) === '/'
      ? 'index, follow'
      : 'noindex, nofollow',
});
const hashedAsset =
  /^\/assets\/.+-[\w-]{8}\.(?:css|js|mjs|woff2?|wasm|png|svg|webp)$/u;

async function handleRequest(
  request: Request,
  env: LmsEnvironment
): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== LMS_ORIGIN || !base.owns(url.pathname)) {
    return new Response('Not Found', { status: 404 });
  }

  const area = lmsArea(url.pathname);
  if (area) {
    try {
      const binding = env[area];
      if (binding) return await binding.fetch(request);
    } catch (error) {
      console.error('LMS area unavailable', area, error);
    }
    return new Response('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  const baseRequest = base.stripRequest(request);
  if (!baseRequest) return new Response('Not Found', { status: 404 });
  const routed = baseRequest;

  const build = workerBuildInfo(routed, 'lms');
  const path = new URL(routed.url).pathname;
  const isAsset = path.startsWith('/assets/');
  const response = policy(build ?? (await renderShell()), {
    request,
    env,
    mounts,
    seoPolicy: undefined,
  });
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    response.status === 200 &&
    hashedAsset.test(path) &&
    response.headers.get('Cache-Control')?.startsWith('public,') &&
    !response.headers.has('Set-Cookie')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=31536000, immutable'
    );
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;

  function renderShell() {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }
    if (path === '/login') {
      return new Response(null, {
        status: 307,
        headers: {
          Location: lmsLoginDestination(url.searchParams.get('next')).href,
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    if (isAsset) return fetchAsset(env.ASSETS, routed);
    // Start canonicalizes the mounted index to a slash. Render that path
    // internally so the public landing stays at the bare mount.
    if (url.pathname === LMS_BASE) url.pathname = `${LMS_BASE}/`;
    return withBridgeRequest({ request, appBase: LMS_BASE }, () =>
      render.fetch(url.href === request.url ? request : retarget(request, url))
    );
  }
}

export default { fetch: withHstsResponsePolicy(handleRequest) };
