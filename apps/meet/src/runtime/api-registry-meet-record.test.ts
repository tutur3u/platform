import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ record: 0, projects: 0, since: 0 }));
const echo =
  (route: string) =>
  async (
    request: Request,
    { params }: { params: Promise<{ wsId: string; meetingId: string }> }
  ) =>
    Response.json({ route, method: request.method, ...(await params) });

vi.mock('../app/api/meet-record/[wsId]/[meetingId]/route', () => {
  loads.record += 1;
  const handler = echo('record');
  return { GET: handler, POST: handler, PATCH: handler, DELETE: handler };
});
vi.mock('../app/api/meet-record/[wsId]/[meetingId]/projects/route', () => {
  loads.projects += 1;
  const handler = echo('projects');
  return { GET: handler, POST: handler, DELETE: handler };
});
vi.mock('../app/api/meet-record/[wsId]/[meetingId]/since/route', () => {
  loads.since += 1;
  const handler = echo('since');
  return { GET: handler, POST: handler };
});

import { dispatchMeetEndpoint } from './api-registry';

const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const base = `https://meet.test/api/meet-record/${wsId}/${meetingId}`;

async function call(path: string, method: string) {
  const response = await dispatchMeetEndpoint(
    new NextRequest(`${base}${path}`, { method })
  );
  return response?.json();
}

it('serves the meeting record routes from the Meet worker, loading each lazily', async () => {
  expect(loads).toEqual({ record: 0, projects: 0, since: 0 });
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'])
    expect(await call('', method)).toEqual({
      route: 'record',
      method,
      wsId,
      meetingId,
    });
  expect(loads).toEqual({ record: 1, projects: 0, since: 0 });
  for (const method of ['GET', 'POST', 'DELETE'])
    expect(await call('/projects', method)).toMatchObject({
      route: 'projects',
      method,
    });
  for (const method of ['GET', 'POST'])
    expect(await call('/since', method)).toMatchObject({
      route: 'since',
      method,
    });
});

it('refuses methods the meeting record routes do not serve', async () => {
  const response = await dispatchMeetEndpoint(
    new NextRequest(`${base}/since`, { method: 'DELETE' })
  );
  expect(response?.status).toBe(405);
});
