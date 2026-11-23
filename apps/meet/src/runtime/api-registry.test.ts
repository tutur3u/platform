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
