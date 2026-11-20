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
const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const PROTECTED = '00000000-0000-4000-8000-0000000000ee';
const session = { claims, identity: { workspaceId: WS } };
const on = {
  MEET_AI_DISABLED: 'false',
  MEET_AI_PROTECTED_WORKSPACE_IDS: PROTECTED,
  MEET_AI_ALL_WORKSPACES: 'reviewed-allow-all-2026-11-20',
};
it('requires explicit false, private authority and consent for Meet and Parley without pilot bypass', () => {
  expect(liveWorkspaceAllowed(on, session)).toBe(true);
  for (const value of [undefined, '', 'true', 'garbage', '*'])
    expect(
      liveWorkspaceAllowed({ ...on, MEET_AI_DISABLED: value }, session)
    ).toBe(false);
  for (const fields of [
    { mode: 'room' },
    { inputSource: undefined },
    { consentRevision: undefined },
    { consentVersion: undefined },
    { workspaceAuthority: undefined },
  ])
    expect(
      liveWorkspaceAllowed(on, {
        ...session,
        claims: { ...claims, ...fields },
      })
    ).toBe(false);
  expect(liveWorkspaceAllowed(undefined, session)).toBe(false);
  // The gate is app-agnostic: a Parley claim carries no pilot bypass.
  const parley = { ...session, claims: { ...claims, app: 'parley' } };
  expect(liveWorkspaceAllowed({}, parley)).toBe(false);
  expect(liveWorkspaceAllowed(on, parley)).toBe(true);
});
it('ends an ongoing session as soon as the workspace gate closes for it', () => {
  // Newly added denylist entry, protected id, missing protection config,
  // removed opt-in without an allowlist entry, or a noncanonical id.
  for (const env of [
    { ...on, MEET_AI_DISABLED_WORKSPACE_IDS: WS },
    { ...on, MEET_AI_DISABLED_WORKSPACE_IDS: 'garbage' },
    { ...on, MEET_AI_PROTECTED_WORKSPACE_IDS: `${PROTECTED},${WS}` },
    { ...on, MEET_AI_PROTECTED_WORKSPACE_IDS: '' },
    { ...on, MEET_AI_ALL_WORKSPACES: undefined },
  ])
    expect(liveWorkspaceAllowed(env, session)).toBe(false);
  expect(
    liveWorkspaceAllowed(
      {
        ...on,
        MEET_AI_ALL_WORKSPACES: undefined,
        MEET_AI_ENABLED_WORKSPACE_IDS: WS,
      },
      session
    )
  ).toBe(true);
  expect(
    liveWorkspaceAllowed(on, {
      ...session,
      identity: { workspaceId: 'synthetic' },
    })
  ).toBe(false);
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
