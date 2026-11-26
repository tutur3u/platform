import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  findLink: vi.fn(),
  hasGrant: vi.fn(),
  findRoom: vi.fn(),
  openRoom: vi.fn(),
  initializeRoom: vi.fn(),
  isLive: vi.fn(),
  limitStatus: vi.fn(),
  credentials: vi.fn(),
  canHost: vi.fn(),
}));
vi.mock('@/lib/integrations/upskii/access', () => ({
  jsonNoStore: (body: unknown, init?: ResponseInit) =>
    NextResponse.json(body, init),
  requireUpskiiAppCredentials: fixtures.credentials,
  canUserLinkUpskii: async () => true,
}));
vi.mock('@/lib/integrations/upskii/link-store', () => ({
  createExternalAccountLinkStore: () => ({ findById: fixtures.findLink }),
}));
vi.mock('@/lib/integrations/upskii/live-class-store', () => ({
  liveClassStore: () => fixtures,
}));
vi.mock('@/lib/integrations/upskii/live-class-meet', () => ({
  initializeLiveClassRoom: fixtures.initializeRoom,
  isLiveClassRoomOpen: fixtures.isLive,
}));
vi.mock('@/lib/integrations/upskii/rate-limit', () => ({
  limitLiveClassStatus: fixtures.limitStatus,
  limitVerifiedAccountLinkRequest: async () => null,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  personalWorkspace: async () => 'personal-workspace',
}));
vi.mock('@tuturuuu/utils/meet-hosting', () => ({
  canVerifiedAccountHostMeeting: fixtures.canHost,
}));
vi.mock('@/lib/meet-app-url', () => ({
  getMeetAppOrigin: () => 'https://meet.tuturuuu.com',
}));

const { POST } = await import('./route');
const meetingId = 'c4b88000-cafe-4000-8000-000000000001';
const linkId = '00000000-0000-4000-8000-000000000001';
const subject = 'upskii-teacher';
const start = {
  action: 'start',
  classId: 'class-1',
  linkId,
  name: 'Workshop',
  upskiiUserId: subject,
};
const status = { action: 'status', classId: 'class-1' };
const link = {
  id: linkId,
  user_id: 'owner',
  external_subject: subject,
  revoked_at: null,
};

const send = (body: object) =>
  POST(
    new NextRequest(
      'https://tuturuuu.com/api/v1/integrations/upskii/live-class',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )
  );

describe('Upskii live class integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const meeting = { ws_id: 'personal-workspace', creator_id: 'owner' };
    fixtures.credentials.mockResolvedValue({
      ok: true,
      admin: {
        auth: { admin: { getUserById: async () => ({ data: { user: {} } }) } },
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: meeting }) }),
          }),
        }),
      },
    });
    fixtures.findLink.mockResolvedValue(link);
    fixtures.hasGrant.mockResolvedValue(true);
    fixtures.canHost.mockResolvedValue(true);
    fixtures.findRoom.mockResolvedValue({
      meeting_id: meetingId,
      owner_id: 'owner',
      owner_subject: subject,
      link_id: linkId,
    });
    fixtures.openRoom.mockResolvedValue({ kind: 'room', meetingId });
    fixtures.isLive.mockResolvedValue(true);
  });

  it('returns the canonical Meet URL using only the transactional room ID', async () => {
    const response = await send(start);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      roomId: meetingId,
      url: expect.stringMatching(/^https:\/\//),
    });
    expect(fixtures.openRoom).toHaveBeenCalledWith({
      p_class_id: 'class-1',
      p_link_id: linkId,
      p_name: 'Workshop',
      p_owner_id: 'owner',
      p_subject: subject,
      p_ws_id: 'personal-workspace',
    });
  });

  it('refuses a caller-supplied room ID', async () => {
    expect((await send({ ...start, roomId: meetingId })).status).toBe(400);
    expect(fixtures.openRoom).not.toHaveBeenCalled();
  });

  it('requires the active linked subject, separate grant and hosting entitlement', async () => {
    fixtures.findLink.mockResolvedValueOnce({ ...link, revoked_at: 'now' });
    expect((await send(start)).status).toBe(403);
    fixtures.hasGrant.mockResolvedValueOnce(false);
    expect((await send(start)).status).toBe(403);
    fixtures.canHost.mockResolvedValueOnce(false);
    expect((await send(start)).status).toBe(403);
    expect(fixtures.openRoom).not.toHaveBeenCalled();
  });

  it('returns no invite if the host leaves or revokes the link during status', async () => {
    fixtures.isLive.mockResolvedValueOnce(false);
    expect(await (await send(status)).json()).toEqual({ live: false });
    fixtures.findLink
      .mockResolvedValueOnce(link)
      .mockResolvedValueOnce({ ...link, revoked_at: 'now' });
    expect(await (await send(status)).json()).toEqual({ live: false });
  });

  it('limits class status before reading mappings or contacting Meet', async () => {
    fixtures.limitStatus.mockResolvedValueOnce(
      new NextResponse(null, { status: 429 })
    );
    expect((await send(status)).status).toBe(429);
    expect(fixtures.limitStatus).toHaveBeenCalledWith('class-1');
    expect(fixtures.findRoom).not.toHaveBeenCalled();
    expect(fixtures.isLive).not.toHaveBeenCalled();
  });

  it('refuses start retry by a different teacher', async () => {
    fixtures.openRoom.mockResolvedValueOnce({ kind: 'conflict' });
    expect((await send(start)).status).toBe(409);
    expect(fixtures.initializeRoom).not.toHaveBeenCalled();
  });
});
