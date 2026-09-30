import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { NextRequest, type NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createCalendarLinkService,
  type MailCalendarAssociation,
} from './calendar-link';
import { projectMailCalendarTarget } from './calendar-link-adapter';
import { calendarPreviewFixture } from './calendar-link-fixture';
import type { MailRouteContext } from './types';

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  linked: vi.fn(),
  snapshot: vi.fn(),
  unlink: vi.fn(),
  association: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(async () => {}),
}));
vi.mock('./auth', () => ({ resolveMailRouteContext: vi.fn() }));
const ctx: MailRouteContext = {
  normalizedWsId: 'mail-ws',
  user: { id: 'actor' },
  supabase: createClient<Database>(
    'https://synthetic.example.test',
    'synthetic-key',
    { auth: { persistSession: false } }
  ),
};
vi.mock('./route-utils', async (original) => ({
  ...(await original<typeof import('./route-utils')>()),
  withMailContext: async (
    _request: NextRequest,
    _ws: string,
    handler: (ctx: MailRouteContext) => Promise<NextResponse>
  ) => handler(ctx),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
}));
vi.mock('./repository/calendar', () => ({ getMailInvitation: mocks.source }));
vi.mock('./repository/calendar-links', () => ({
  mailCalendarLinks: () => ({
    service: {
      preview: mocks.preview,
      confirm: mocks.confirm,
      linkedTarget: mocks.linked,
      linkedAssociation: mocks.snapshot,
      unlink: mocks.unlink,
    },
    readAssociation: mocks.association,
  }),
}));

import { POST } from '../../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview/route';
import {
  DELETE,
  GET,
  PUT,
} from '../../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/route';

const ws = '11111111-1111-4111-8111-111111111111',
  event = '22222222-2222-4222-8222-222222222222',
  receipt = 'a'.repeat(64);
const context = {
  params: Promise.resolve({
    wsId: 'mail-ws',
    mailboxId: 'box',
    messageId: 'request',
  }),
};
function request(method: string, body?: unknown) {
  return new NextRequest('https://mail.example.test/api', {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.source.mockResolvedValue({
    invitation: {
      uid: 'uid',
      sequence: 1,
      organizer: 'host@example.test',
      attendee: 'guest@example.test',
      recurrence: null,
    },
  });
  mocks.normalize.mockResolvedValue(ws);
  mocks.preview.mockResolvedValue({ receipt });
  mocks.confirm.mockResolvedValue({ status: 'linked' });
  mocks.unlink.mockResolvedValue({ status: 'unlinked' });
  mocks.linked.mockResolvedValue(null);
  mocks.snapshot.mockResolvedValue({ target: null, association: null });
  mocks.association.mockResolvedValue(null);
});
it('normalizes personal selection under the request actor and previews without writes', async () => {
  const response = await POST(
    request('POST', { calendarWorkspaceId: 'personal', eventId: event }),
    context
  );
  expect(await response.json()).toEqual({ preview: { receipt } });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.normalize).toHaveBeenCalledWith(
    'personal',
    ctx.supabase,
    expect.any(NextRequest)
  );
  expect(mocks.preview).toHaveBeenCalledWith({
    actorId: 'actor',
    mailboxId: 'box',
    messageId: 'request',
    workspaceId: ws,
    eventId: event,
  });
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it('requires explicit strict confirmation and rejects actor override or invalid reference', async () => {
  expect(
    (
      await PUT(
        request('PUT', { calendarWorkspaceId: ws, eventId: event, receipt }),
        context
      )
    ).status
  ).toBe(200);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(
    (
      await PUT(
        request('PUT', {
          calendarWorkspaceId: ws,
          eventId: event,
          receipt,
          actorId: 'other',
        }),
        context
      )
    ).status
  ).toBe(400);
  expect(
    (
      await POST(
        request('POST', { calendarWorkspaceId: ws, eventId: 'invalid' }),
        context
      )
    ).status
  ).toBe(400);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
});
it('suppresses inaccessible or superseded source and fences unlink with saved receipt', async () => {
  mocks.source.mockResolvedValue(null);
  expect(await (await GET(request('GET'), context)).json()).toEqual({
    target: null,
    association: null,
  });
  expect(
    await (
      await POST(
        request('POST', { calendarWorkspaceId: ws, eventId: event }),
        context
      )
    ).json()
  ).toEqual({ preview: null });
  expect(mocks.preview).not.toHaveBeenCalled();
  mocks.source.mockResolvedValue({
    invitation: {
      uid: 'uid',
      sequence: 1,
      organizer: 'host@example.test',
      attendee: 'guest@example.test',
      recurrence: null,
    },
  });
  const target = { eventId: event };
  mocks.association.mockResolvedValue({ receipt, target });
  expect(
    await (
      await DELETE(request('DELETE', { receipt: 'b'.repeat(64) }), context)
    ).json()
  ).toEqual({ status: 'changed' });
  expect(mocks.unlink).not.toHaveBeenCalled();
  expect(
    await (await DELETE(request('DELETE', { receipt }), context)).json()
  ).toEqual({ status: 'unlinked' });
  expect(mocks.unlink).toHaveBeenCalledWith(
    'actor',
    'box',
    'request',
    target,
    receipt
  );
});

function actualServiceFixture() {
  let saved: MailCalendarAssociation | null = null;
  const authority = calendarPreviewFixture();
  const readTarget = vi.fn(
    async () => projectMailCalendarTarget('actor', 'ws', 'event', authority)!
  );
  const save = vi.fn(
    async (
      _actor: string,
      _key: string,
      expected: MailCalendarAssociation | null,
      next: MailCalendarAssociation | null
    ) => {
      if (saved !== expected) return false;
      saved = next;
      return true;
    }
  );
  const service = createCalendarLinkService({
    readInvitation: async () => ({
      uid: 'uid',
      sequence: 1,
      organizer: 'host@example.test',
      attendee: 'guest@example.test',
      recurrence: null,
      summary: 'Invitation',
      start: '20261002T063000Z',
      when: 'Original time',
      timezone: [],
      location: '',
      joinUrl: null,
    }),
    readTarget,
    readAssociation: async () => saved,
    saveAssociation: save,
  });
  mocks.linked.mockImplementation(service.linkedTarget);
  mocks.snapshot.mockImplementation(service.linkedAssociation);
  mocks.unlink.mockImplementation(service.unlink);
  mocks.association.mockImplementation(async () => saved);
  return { service, authority, readTarget, save, saved: () => saved };
}
const serviceSelection = {
  actorId: 'actor',
  mailboxId: 'box',
  messageId: 'request',
  workspaceId: 'ws',
  eventId: 'event',
};
it('returns one GET snapshot when another tab refreshes the same target during authorization', async () => {
  const fixture = actualServiceFixture();
  const initial = await fixture.service.preview(serviceSelection);
  await fixture.service.confirm(serviceSelection, initial!.receipt);
  const associationA = fixture.saved();
  const targetA = projectMailCalendarTarget(
    'actor',
    'ws',
    'event',
    structuredClone(fixture.authority)
  )!;
  fixture.readTarget.mockImplementationOnce(async () => {
    fixture.authority.revision = 'new-revision';
    const refreshed = await fixture.service.preview(serviceSelection);
    await fixture.service.confirm(serviceSelection, refreshed!.receipt);
    return targetA;
  });
  const result = await (await GET(request('GET'), context)).json();
  expect(fixture.saved()?.receipt).not.toBe(associationA?.receipt);
  expect(result.target.authority.revision).toBe('rev');
  expect(result.association.receipt).toBe(associationA?.receipt);
});
it('preserves a same-target confirmation between the DELETE route check and service reread', async () => {
  const fixture = actualServiceFixture();
  const initial = await fixture.service.preview(serviceSelection);
  await fixture.service.confirm(serviceSelection, initial!.receipt);
  const associationA = fixture.saved()!;
  mocks.association.mockImplementationOnce(async () => {
    fixture.authority.revision = 'new-revision';
    const refreshed = await fixture.service.preview(serviceSelection);
    await fixture.service.confirm(serviceSelection, refreshed!.receipt);
    return associationA;
  });
  const result = await (
    await DELETE(request('DELETE', { receipt: associationA.receipt }), context)
  ).json();
  expect(result).toEqual({ status: 'changed' });
  expect(fixture.saved()?.receipt).not.toBe(associationA.receipt);
  expect(fixture.saved()).not.toBeNull();
  expect(fixture.save).toHaveBeenCalledTimes(2);
});
