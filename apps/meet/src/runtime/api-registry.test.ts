import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ buildInfo: 0, memory: 0 }));
vi.mock('../app/api/build-info/route', () => {
  loads.buildInfo += 1;
  return { GET: () => Response.json({ ok: true }) };
});
vi.mock('../app/api/meet-live/memory/route', () => {
  loads.memory += 1;
  return { GET: () => new Response('memory'), POST: vi.fn() };
});

import { dispatchMeetEndpoint } from './api-registry';

const loadedAtImport = { ...loads };

beforeEach(() => {
  loads.buildInfo = 0;
  loads.memory = 0;
});

it('loads no endpoint module until a request matches it', async () => {
  expect(loadedAtImport).toEqual({ buildInfo: 0, memory: 0 });
  const response = await dispatchMeetEndpoint(
    new NextRequest('https://meet.test/api/build-info')
  );
  expect(await response?.json()).toEqual({ ok: true });
  expect(loads.memory).toBe(0);
});

it('answers OPTIONS and 405 without loading the endpoint module', async () => {
  const options = await dispatchMeetEndpoint(
    new NextRequest('https://meet.test/api/meet-live/memory', {
      method: 'OPTIONS',
    })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  const notAllowed = await dispatchMeetEndpoint(
    new NextRequest('https://meet.test/api/meet-live/memory', {
      method: 'DELETE',
    })
  );
  expect(notAllowed?.status).toBe(405);
  expect(loads.memory).toBe(0);
});

it('keeps HEAD answering from the GET handler without a body', async () => {
  const response = await dispatchMeetEndpoint(
    new NextRequest('https://meet.test/api/meet-live/memory', {
      method: 'HEAD',
    })
  );
  expect(response?.status).toBe(200);
  expect(await response?.text()).toBe('');
});
