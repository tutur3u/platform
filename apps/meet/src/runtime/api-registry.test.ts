import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({
  buildInfo: 0,
  memory: 0,
  quizArena: 0,
  document: 0,
}));
const documentPost = vi.hoisted(() =>
  vi.fn(
    async (
      _request: Request,
      { params }: { params: Promise<{ meetingId: string }> }
    ) => Response.json({ meetingId: (await params).meetingId })
  )
);
vi.mock('../app/api/meet-call/[meetingId]/document/route', () => {
  loads.document += 1;
  return { GET: () => Response.json({ tabs: [] }), POST: documentPost };
});
vi.mock('../app/api/build-info/route', () => {
  loads.buildInfo += 1;
  return { GET: () => Response.json({ ok: true }) };
});
vi.mock('../app/api/meet-live/memory/route', () => {
  loads.memory += 1;
  return { GET: () => new Response('memory'), POST: vi.fn() };
});

vi.mock('../app/api/meet-call/[meetingId]/quiz-arena/route', () => {
  loads.quizArena += 1;
  return {
    GET: async (
      _request: Request,
      { params }: { params: Promise<{ meetingId: string }> }
    ) => Response.json({ meetingId: (await params).meetingId }),
    POST: vi.fn(),
  };
});

const selfPosts = vi.hoisted(() => ({
  outbox: vi.fn(async () => Response.json({ route: 'outbox' })),
  meeting: vi.fn(
    async (
      _request: Request,
      { params }: { params: Promise<{ wsId: string; meetingId: string }> }
    ) => Response.json(await params)
  ),
}));
vi.mock('../app/api/meet-ai/self/outbox/route', () => ({
  POST: selfPosts.outbox,
}));
for (const name of ['choice', 'mode', 'open', 'renew'])
  vi.doMock(`../app/api/meet-ai/[wsId]/[meetingId]/self/${name}/route`, () => ({
    POST: selfPosts.meeting,
  }));

import { dispatchMeetEndpoint } from './api-registry';

const loadedAtImport = { ...loads };

beforeEach(() => {
  loads.buildInfo = 0;
  loads.memory = 0;
  loads.document = 0;
});

it('loads no endpoint module until a request matches it', async () => {
  expect(loadedAtImport).toEqual({
    buildInfo: 0,
    memory: 0,
    quizArena: 0,
    document: 0,
  });
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

it('handles OPTIONS and 405 for /api/meet-call/[meetingId]/polls lazily', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const options = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${id}/polls`, {
      method: 'OPTIONS',
    })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  const notAllowed = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${id}/polls`, {
      method: 'DELETE',
    })
  );
  expect(notAllowed?.status).toBe(405);
});

it('dispatches /api/meet-call/[meetingId]/quiz-arena lazily', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const url = `https://meet.test/api/meet-call/${id}/quiz-arena`;
  const options = await dispatchMeetEndpoint(
    new NextRequest(url, { method: 'OPTIONS' })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  expect(
    (await dispatchMeetEndpoint(new NextRequest(url, { method: 'DELETE' })))
      ?.status
  ).toBe(405);
  expect(loads.quizArena).toBe(0);
  const response = await dispatchMeetEndpoint(
    new NextRequest(`${url}?sinceSeq=4`)
  );
  expect(await response?.json()).toEqual({ meetingId: id });
  expect(loads.quizArena).toBe(1);
});

it('routes shared document tab commands to the document POST handler', async () => {
  const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
  const options = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${meetingId}/document`, {
      method: 'OPTIONS',
    })
  );
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  expect(loads.document).toBe(0);
  const response = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${meetingId}/document`, {
      method: 'POST',
      body: JSON.stringify({ action: 'create', kind: 'notes' }),
    })
  );
  expect(await response?.json()).toEqual({ meetingId });
  expect(documentPost).toHaveBeenCalledTimes(1);
});

it('handles OPTIONS and 405 for /api/meet-call/[meetingId]/guest lazily', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const options = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${id}/guest`, {
      method: 'OPTIONS',
    })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('POST, DELETE, OPTIONS');
  const notAllowed = await dispatchMeetEndpoint(
    new NextRequest(`https://meet.test/api/meet-call/${id}/guest`, {
      method: 'GET',
    })
  );
  expect(notAllowed?.status).toBe(405);
});

it('dispatches /api/meet-call/[meetingId]/mira-room for GET and POST only', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const url = `https://meet.test/api/meet-call/${id}/mira-room`;
  const options = await dispatchMeetEndpoint(
    new NextRequest(url, { method: 'OPTIONS' })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  expect(
    (await dispatchMeetEndpoint(new NextRequest(url, { method: 'DELETE' })))
      ?.status
  ).toBe(405);
});

it('dispatches /api/meet-call/[meetingId]/transcript-consent for GET and POST only', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const url = `https://meet.test/api/meet-call/${id}/transcript-consent`;
  const options = await dispatchMeetEndpoint(
    new NextRequest(url, { method: 'OPTIONS' })
  );
  expect(options?.status).toBe(204);
  expect(options?.headers.get('Allow')).toBe('GET, POST, HEAD, OPTIONS');
  expect(
    (await dispatchMeetEndpoint(new NextRequest(url, { method: 'DELETE' })))
      ?.status
  ).toBe(405);
});

it('dispatches the per-speaker POST routes inside the Meet worker', async () => {
  const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  const outbox = await dispatchMeetEndpoint(
    new NextRequest('https://meet.test/api/meet-ai/self/outbox', {
      method: 'POST',
    })
  );
  // The static outbox route wins over /api/meet-ai/[wsId]/[meetingId].
  expect(await outbox?.json()).toEqual({ route: 'outbox' });
  for (const name of ['choice', 'mode', 'open', 'renew']) {
    const url = `https://meet.test/api/meet-ai/personal/${id}/self/${name}`;
    const response = await dispatchMeetEndpoint(
      new NextRequest(url, { method: 'POST' })
    );
    expect(await response?.json()).toEqual({ wsId: 'personal', meetingId: id });
    expect(
      (await dispatchMeetEndpoint(new NextRequest(url, { method: 'GET' })))
        ?.status
    ).toBe(405);
  }
  expect(selfPosts.meeting).toHaveBeenCalledTimes(4);
});
