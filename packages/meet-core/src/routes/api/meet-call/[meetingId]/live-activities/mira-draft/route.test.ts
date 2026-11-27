import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getMeetCallAccess: vi.fn(),
  draft: vi.fn(),
}));

const { AccessError } = vi.hoisted(() => ({
  AccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {
    status = 500;
  },
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {
    status = 500;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('../../../../../../features/call/lib/call-access', () => ({
  MeetCallAccessError: AccessError,
  getMeetCallAccess: mocks.getMeetCallAccess,
}));
vi.mock('../../../../../../features/call/lib/guest-access', () => ({
  getMeetGuestCallAccess: vi.fn(),
}));
vi.mock(
  '../../../../../../features/call/server/live-activities/mira-activity-draft',
  () => ({
    draftMeetLiveActivity: mocks.draft,
  })
);

import { POST } from './route';

const MEETING_ID = '9987d372-ee63-4228-8b17-3757ca5d1ccf';
const ORIGIN = 'https://meet.tuturuuu.com';
const URL = `${ORIGIN}/api/meet-call/${MEETING_ID}/live-activities/mira-draft`;
const params = Promise.resolve({ meetingId: MEETING_ID });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.getMeetCallAccess.mockResolvedValue({
    user: { id: 'host-1' },
    meeting: { id: MEETING_ID, ws_id: 'ws-1' },
    isHost: true,
    canReadWorkspace: true,
  });
});

describe('POST /api/meet-call/[meetingId]/live-activities/mira-draft', () => {
  it('rejects cross-origin POST requests with 403', async () => {
    const req = new Request(URL, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'flashcards', prompt: 'Biology' }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('rejects guests through roomRoute with 401', async () => {
    mocks.getMeetCallAccess.mockRejectedValue(
      new AccessError(401, 'Sign in to join')
    );
    const req = new Request(URL, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'flashcards', prompt: 'Biology' }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('returns 413 when payload exceeds 16 KiB', async () => {
    const oversized = JSON.stringify({
      kind: 'flashcards',
      prompt: 'a'.repeat(17 * 1024),
    });
    const req = new Request(URL, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: oversized,
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(413);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON instead of 500', async () => {
    const req = new Request(URL, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    expect(mocks.draft).not.toHaveBeenCalled();
  });
});
