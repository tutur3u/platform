import { beforeEach, expect, it, vi } from 'vitest';
import { MeetCallAccessError } from '../lib/call-access';
import { meetingDocumentChannel } from './documents';
import type { SignedInMeetCallAccess } from './room-service';

const backend = vi.hoisted(() => ({
  read: vi.fn(),
  room: vi.fn(),
  AccountServiceError: class extends Error {
    constructor(readonly status: number) {
      super('Fixture document store failure');
    }
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: backend.read,
  AccountServiceError: backend.AccountServiceError,
}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./room-service', () => ({ callRoomService: backend.room }));

const access = {
  meeting: { id: 'fixture-meeting' },
} as SignedInMeetCallAccess;

beforeEach(() => vi.resetAllMocks());

it('keeps a room denial and never looks up the document before admission', async () => {
  backend.room.mockRejectedValue(new MeetCallAccessError(403, 'fixture'));
  await expect(meetingDocumentChannel(access, 'primary')).rejects.toMatchObject(
    {
      status: 403,
    }
  );
  expect(backend.read).not.toHaveBeenCalled();
});

it('treats a service-role storage denial as an outage after room authorization', async () => {
  backend.room.mockResolvedValue({});
  backend.read.mockRejectedValue(new backend.AccountServiceError(403));
  await expect(meetingDocumentChannel(access, 'primary')).rejects.toMatchObject(
    {
      status: 503,
    }
  );
  expect(backend.read).toHaveBeenCalledWith('read_meeting_document', {
    p_meeting_id: access.meeting.id,
  });
});
