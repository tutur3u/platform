import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const limits = vi.hoisted(() => vi.fn(async () => ({ maxParticipants: 50 })));
vi.mock('./classroom-policy', () => ({ getMeetRoomCapacityLimits: limits }));
import { getMeetCallSession, meetDeviceIdentity } from './call-session';

it('binds a stable device identity to both account and device', async () => {
  const identity = await meetDeviceIdentity('account-a', 'device-a');
  expect(await meetDeviceIdentity('account-a', 'device-a')).toBe(identity);
  expect(await meetDeviceIdentity('account-b', 'device-a')).not.toBe(identity);
  expect(await meetDeviceIdentity('account-a', 'device-b')).not.toBe(identity);
  expect(identity).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
  );
});

it('reads capacity for admission and settings writes, skipping internal service and state reads', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const person = {
    displayName: 'Minh',
    isHost: true,
    meetingId: id,
    userId: id,
    wsId: id,
  };
  await getMeetCallSession({ ...person, service: true });
  await getMeetCallSession({ ...person, readRoomState: true });
  expect(limits).not.toHaveBeenCalled();
  await getMeetCallSession(person);
  await getMeetCallSession({ ...person, readRoomState: false });
  expect(limits).toHaveBeenCalledTimes(2);
});

it('gives a member without a device id a stable connection id that is not the account id', async () => {
  process.env.MEET_REALTIME_TOKEN_SECRET = 'call-session-secret';
  const { verifyMeetRealtimeToken } =
    await import('@tuturuuu/realtime/meet/token');
  const account = '22222222-2222-4222-8222-222222222222';
  const id = '33333333-3333-4333-8333-333333333333';
  const person = {
    displayName: 'Minh',
    isHost: false,
    meetingId: id,
    userId: account,
    wsId: id,
  };
  const read = async (
    input: Partial<Parameters<typeof getMeetCallSession>[0]>
  ) =>
    verifyMeetRealtimeToken(
      (await getMeetCallSession({ ...person, ...input })).token,
      'call-session-secret'
    );
  const socket = await read({});
  expect(socket?.accountId).toBe(account);
  expect(socket?.userId).not.toBe(account);
  // Reconnects and service calls share one identity in the room.
  expect((await read({}))?.userId).toBe(socket?.userId);
  expect((await read({ service: true }))?.userId).toBe(socket?.userId);
  // A device id still gives each device its own id.
  const device = await read({
    deviceId: '44444444-4444-4444-8444-444444444444',
  });
  expect(device?.userId).toBe(
    await meetDeviceIdentity(account, '44444444-4444-4444-8444-444444444444')
  );
  // A guest id is already a per-meeting pseudonym and stays as issued.
  const guest = await read({ guest: true });
  expect(guest?.userId).toBe(account);
});
