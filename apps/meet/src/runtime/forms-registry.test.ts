import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

vi.mock(
  '../app/api/meet-call/[meetingId]/forms/[launchId]/extended/responses/[responseId]/files/[uploadId]/route',
  () => ({
    GET: async (_request: Request, { params }: { params: Promise<unknown> }) =>
      Response.json(await params),
  })
);
vi.mock(
  '../app/api/meet-call/[meetingId]/forms/[launchId]/extended/uploads/route',
  () => ({
    POST: async (_request: Request, { params }: { params: Promise<unknown> }) =>
      Response.json(await params),
  })
);

vi.mock(
  '../app/api/meet-call/[meetingId]/forms/[launchId]/prefill/route',
  () => ({
    POST: async (_request: Request, { params }: { params: Promise<unknown> }) =>
      Response.json(await params),
  })
);

import { dispatchMeetEndpoint } from './api-registry';

const prefix = 'https://meet.test/api/meet-call/meeting/forms/launch/extended';

it('dispatches core prefill with its meeting and launch parameters', async () => {
  const response = await dispatchMeetEndpoint(
    new NextRequest(
      'https://meet.test/api/meet-call/meeting/forms/launch/prefill',
      {
        method: 'POST',
      }
    )
  );
  expect(await response?.json()).toEqual({
    meetingId: 'meeting',
    launchId: 'launch',
  });
});

it('forwards the exact meeting, launch, response and upload parameters', async () => {
  const response = await dispatchMeetEndpoint(
    new NextRequest(`${prefix}/responses/response/files/upload`)
  );
  expect(await response?.json()).toEqual({
    meetingId: 'meeting',
    launchId: 'launch',
    responseId: 'response',
    uploadId: 'upload',
  });
});

it('routes bounded upload POSTs and exposes no cleanup or maintenance HTTP entry', async () => {
  const response = await dispatchMeetEndpoint(
    new NextRequest(`${prefix}/uploads`, { method: 'POST' })
  );
  expect(await response?.json()).toEqual({
    meetingId: 'meeting',
    launchId: 'launch',
  });
  expect(
    await dispatchMeetEndpoint(
      new NextRequest(`${prefix}/uploads/cleanup`, { method: 'POST' })
    )
  ).toBeNull();
});
