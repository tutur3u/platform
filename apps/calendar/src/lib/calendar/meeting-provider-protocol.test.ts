// @vitest-environment node
import { Buffer } from 'node:buffer';
import { google, OAuth2Client } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleMutationProvider } from './google-color-operations/mutation-provider';
import { createSealedMutationCodec } from './google-color-operations/sealed-mutation';
import { respondToProviderMeeting } from './meeting-provider-response';
import type { ResolvedCalendarSource } from './source-resolver';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('./provider-writes', () => ({ createGoogleAuthClient: mocks.auth }));
vi.mock('../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));

const source = {
  provider: 'google',
  accountEmail: 'guest@example.test',
  accountName: 'Guest',
  externalCalendarId: 'guest@example.test',
  accessToken: 'synthetic-token',
  accessRole: 'owner',
  connectionId: 'connection',
  workspaceCalendarId: null,
  label: 'Fixture',
  color: null,
} satisfies ResolvedCalendarSource;
const identity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: source.externalCalendarId,
  providerEventId: 'recurring-instance',
};
const operationId = '11111111-1111-4111-8111-111111111111';

function fixture(etag: string | null = '"version-1"', patchStatus = 200) {
  const requests: Request[] = [];
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: 'synthetic-token' });
  // The real SDK serializes URLs, headers and JSON; only its network boundary
  // is replaced. Unexpected requests fail here and can never reach Google.
  auth.transporter.defaults.fetchImplementation = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const url = new URL(request.url);
    expect(url.origin).toBe('https://www.googleapis.com');
    expect(decodeURIComponent(url.pathname)).toBe(
      '/calendar/v3/calendars/guest@example.test/events/recurring-instance'
    );
    if (request.method === 'GET') {
      return Response.json({
        id: 'recurring-instance',
        etag,
        recurringEventId: 'master',
        originalStartTime: {
          dateTime: '2026-03-08T09:00:00-04:00',
          timeZone: 'America/New_York',
        },
        attendees: [
          { email: 'guest@example.test', self: true },
          { email: 'other@example.test', responseStatus: 'accepted' },
        ],
        organizer: { email: 'organizer@example.test', self: false },
      });
    }
    expect(request.method).toBe('PATCH');
    return Response.json(
      patchStatus === 200
        ? { id: 'recurring-instance', etag: '"version-2"' }
        : { error: { code: patchStatus, message: 'Precondition failed' } },
      { status: patchStatus }
    );
  };
  mocks.auth.mockReturnValue(auth);
  return { requests, api: google.calendar({ version: 'v3', auth }) };
}

async function expectReply(request: Request | undefined, response: string) {
  expect(request).toBeDefined();
  if (!request) throw new Error('Missing serialized reply');
  expect(request.method).toBe('PATCH');
  expect(new URL(request.url).searchParams.get('sendUpdates')).toBe('all');
  expect(request.headers.get('If-Match')).toBe('"version-1"');
  expect(await request.json()).toEqual({
    attendeesOmitted: true,
    attendees: [{ email: 'guest@example.test', responseStatus: response }],
  });
}

describe('Google native RSVP serialized protocol', () => {
  it.each(['accepted', 'declined', 'tentative'] as const)(
    'serializes a version-bound %s for the invited recurring instance',
    async (response) => {
      const f = fixture();
      await respondToProviderMeeting({
        source,
        externalEventId: identity.providerEventId,
        response,
      });
      expect(f.requests).toHaveLength(2);
      await expectReply(f.requests[1], response);
    }
  );

  it('does not dispatch when the serialized provider snapshot has no version', async () => {
    const f = fixture(null);
    await expect(
      respondToProviderMeeting({
        source,
        externalEventId: identity.providerEventId,
        response: 'accepted',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(f.requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('preserves a provider 412 without retrying or claiming a response was sent', async () => {
    const f = fixture('"version-1"', 412);
    await expect(
      respondToProviderMeeting({
        source,
        externalEventId: identity.providerEventId,
        response: 'declined',
      })
    ).rejects.toMatchObject({ response: { status: 412 } });
    expect(f.requests).toHaveLength(2);
    await expectReply(f.requests[1], 'declined');
  });

  it('replays the sealed RSVP with the original version and operation marker', async () => {
    const f = fixture();
    const access = { assertAllowed: async () => {} };
    const codec = createSealedMutationCodec({
      access,
      getKey: async () => Buffer.alloc(32, 17),
    });
    const provider = createGoogleMutationProvider({
      access,
      codec,
      resolve: async () => f.api,
    });
    const prepared = await provider.prepare({
      operationId,
      generation: '1',
      identity,
      action: 'patch',
      providerPatch: {},
      meetingResponse: {
        accountEmail: source.accountEmail,
        response: 'tentative',
      },
      sendUpdates: 'all',
    });
    expect(JSON.stringify(prepared.journal)).not.toContain(source.accountEmail);
    expect(JSON.stringify(prepared.journal)).not.toContain('tentative');
    await provider.dispatch(identity, prepared);
    await provider.dispatch(identity, prepared);
    expect(f.requests).toHaveLength(3);
    for (const request of f.requests.slice(1)) {
      expect(request.headers.get('If-Match')).toBe('"version-1"');
      expect(new URL(request.url).searchParams.get('sendUpdates')).toBe('all');
      expect(await request.json()).toEqual({
        attendeesOmitted: true,
        attendees: [
          { email: 'guest@example.test', responseStatus: 'tentative' },
        ],
        extendedProperties: {
          private: { tuturuuuColorOperation: operationId },
        },
      });
    }
  });
});
