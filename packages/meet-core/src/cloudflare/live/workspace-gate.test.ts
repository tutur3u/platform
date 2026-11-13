import { expect, it, vi } from 'vitest';
import { liveWorkspaceAllowed } from './workspace-gate';
import { requireCurrentPrivateGrant } from './private-grant';
const room = vi.hoisted(() => vi.fn());
vi.mock('./room', () => ({ liveRoomCommand: room }));
const claims = {
  mode: 'personal',
  ownerId: 'synthetic-owner',
  meetingId: 'synthetic-meeting',
  inputSource: 'private-microphone',
  consentVersion: 'synthetic-v1',
  consentRevision: 1,
  workspaceAuthority: 'verified-personal',
};
const session = { claims, identity: { workspaceId: 'synthetic-workspace' } };
it('requires explicit false, private authority and consent for Meet and Parley without pilot bypass', () => {
  expect(liveWorkspaceAllowed({ MEET_AI_DISABLED: 'false' }, session)).toBe(
    true
  );
  for (const value of [undefined, '', 'true', 'garbage', '*'])
    expect(liveWorkspaceAllowed({ MEET_AI_DISABLED: value }, session)).toBe(
      false
    );
  for (const fields of [
    { mode: 'room' },
    { inputSource: undefined },
    { consentRevision: undefined },
    { consentVersion: undefined },
    { workspaceAuthority: undefined },
  ])
    expect(
      liveWorkspaceAllowed(
        { MEET_AI_DISABLED: 'false' },
        { ...session, claims: { ...claims, ...fields } }
      )
    ).toBe(false);
  expect(liveWorkspaceAllowed(undefined, session)).toBe(false);
  // The gate is app-agnostic: a Parley claim carries no pilot bypass.
  const parley = { ...session, claims: { ...claims, app: 'parley' } };
  expect(liveWorkspaceAllowed({}, parley)).toBe(false);
});
it('rechecks the exact durable own-account/meeting/version/revision before provider connection', async () => {
  const choice = {
    choice: 'continue',
    accountId: claims.ownerId,
    meetingId: claims.meetingId,
    version: claims.consentVersion,
    revision: 1,
  };
  room.mockResolvedValue({ choice });
  await expect(
    requireCurrentPrivateGrant({} as never, session as never)
  ).resolves.toBeUndefined();
  for (const changed of [
    null,
    { ...choice, choice: 'mute' },
    { ...choice, revision: 2 },
    { ...choice, accountId: 'other' },
    { ...choice, meetingId: 'other' },
    { ...choice, version: 'old' },
  ]) {
    room.mockResolvedValue({ choice: changed });
    await expect(
      requireCurrentPrivateGrant({} as never, session as never)
    ).rejects.toThrow();
  }
  room.mockRejectedValue(new Error('Synthetic read error'));
  await expect(
    requireCurrentPrivateGrant({} as never, session as never)
  ).rejects.toThrow();
});
