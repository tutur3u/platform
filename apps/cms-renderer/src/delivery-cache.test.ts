import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../fixtures/first-site.json';
import { clearDeliveryMemo } from './delivery-memo';
import { loadPublishedPage } from './live-delivery';
import { cacheRequest, type Environment, serve } from './worker';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const body = {
  workspaceId,
  collections: [
    {
      entries: [
        {
          id: 'home-id',
          slug: 'home',
          title: 'First site',
          status: 'published',
          publishedPageVersion: {
            id: 'snapshot-one',
            schema_version: 1,
            blocks: fixture,
          },
        },
      ],
    },
  ],
};

type Step = {
  status?: number;
  etag?: string;
  version?: string;
  body?: unknown;
};

function scriptedFetch(steps: Step[]) {
  const seen: Array<string | null> = [];
  let index = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    seen.push(new Headers(init?.headers).get('if-none-match'));
    const step = steps[Math.min(index++, steps.length - 1)] as Step;
    const headers = new Headers();
    if (step.etag) headers.set('etag', step.etag);
    if (step.version) headers.set('x-tuturuuu-delivery-version', step.version);
    if (step.status === 304)
      return new Response(null, { status: 304, headers });
    return Response.json(step.body ?? body, {
      status: step.status ?? 200,
      headers,
    });
  };
  return { fetcher, seen };
}

const load = (fetcher: typeof fetch) =>
  loadPublishedPage({
    origin: 'https://live-api.invalid',
    workspaceId,
    path: '/',
    fetch: fetcher,
  });

describe('delivery revalidation', () => {
  beforeEach(() => clearDeliveryMemo());

  it('sends If-None-Match and serves the memoized page on a 304', async () => {
    const { fetcher, seen } = scriptedFetch([
      { etag: 'W/"rev-1"', version: '4' },
      { status: 304, etag: 'W/"rev-1"', version: '4' },
    ]);
    const first = await load(fetcher);
    const second = await load(fetcher);
    expect(seen).toEqual([null, 'W/"rev-1"']);
    expect(first).toMatchObject({ kind: 'page', deliveryVersion: '4' });
    expect(second).toEqual(first);
  });

  it('takes the version from a 304 header and falls back to the memo', async () => {
    const { fetcher } = scriptedFetch([
      { etag: 'W/"rev-1"', version: '4' },
      { status: 304, version: '5' },
      { status: 304 },
    ]);
    await load(fetcher);
    expect(await load(fetcher)).toMatchObject({ deliveryVersion: '5' });
    expect(await load(fetcher)).toMatchObject({ deliveryVersion: '4' });
  });

  it('ignores malformed version headers', async () => {
    const { fetcher } = scriptedFetch([
      { etag: 'W/"rev-1"', version: 'a b&c=d' },
    ]);
    expect(await load(fetcher)).toMatchObject({
      kind: 'page',
      deliveryVersion: undefined,
    });
  });

  it('drops the memo when a response carries no ETag', async () => {
    const { fetcher, seen } = scriptedFetch([{ etag: 'W/"rev-1"' }, {}, {}]);
    await load(fetcher);
    await load(fetcher);
    await load(fetcher);
    expect(seen).toEqual([null, 'W/"rev-1"', null]);
  });

  it('keeps the memo across a transient upstream failure', async () => {
    const { fetcher, seen } = scriptedFetch([
      { etag: 'W/"rev-1"' },
      { status: 503, body: { error: 'down' } },
      { status: 304 },
    ]);
    await load(fetcher);
    expect(await load(fetcher)).toEqual({ kind: 'unavailable' });
    expect(await load(fetcher)).toMatchObject({ kind: 'page' });
    expect(seen).toEqual([null, 'W/"rev-1"', 'W/"rev-1"']);
  });
});

describe('rendered HTML cache key', () => {
  const key = {
    origin: 'https://first.invalid',
    site: 'a',
    path: '/',
    locale: 'vi',
    version: 'v1',
    workspaceId,
    epoch: 'epoch',
  };

  it('changes with the delivery version and is stable without one', () => {
    expect(cacheRequest({ ...key, deliveryVersion: '1' }).url).not.toBe(
      cacheRequest({ ...key, deliveryVersion: '2' }).url
    );
    expect(cacheRequest(key).url).toBe(
      cacheRequest({ ...key, deliveryVersion: undefined }).url
    );
  });

  it('re-renders after a publish bumps the delivery version', async () => {
    const items = new Map<string, Response>();
    const cache = {
      match: async (request: RequestInfo | URL) =>
        items.get(new Request(request).url)?.clone(),
      put: async (request: RequestInfo | URL, response: Response) => {
        items.set(new Request(request).url, response.clone());
      },
      delete: async (request: RequestInfo | URL) =>
        items.delete(new Request(request).url),
    };
    const environment: Environment = {
      CMS_DELIVERY_ORIGIN: 'https://delivery.invalid',
      CMS_SITES: JSON.stringify({
        'first.invalid': {
          id: 'site-one',
          workspaceId,
          defaultLocale: 'vi',
        },
      }),
    };
    let version = '1';
    let renders = 0;
    const fetcher: typeof fetch = async () =>
      Response.json(body, {
        headers: { 'x-tuturuuu-delivery-version': version },
      });
    const run = () =>
      serve(new Request('https://first.invalid/'), environment, {
        cache,
        fetch: fetcher,
        render: async () => {
          renders++;
          return new Response('<html></html>');
        },
      });

    await run();
    await run();
    expect(renders).toBe(1);
    version = '2';
    await run();
    expect(renders).toBe(2);
    await run();
    expect(renders).toBe(2);
  });
});
