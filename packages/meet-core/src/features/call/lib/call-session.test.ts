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
