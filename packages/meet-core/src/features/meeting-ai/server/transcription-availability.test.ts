import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  attestation: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));
vi.mock('../../live-assistant/server/mira-attestation', () => ({
  readMiraAdultAttestation: mocks.attestation,
}));

import { MEET_AI_ALL_WORKSPACES_REVIEWED } from '@tuturuuu/realtime/meet';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { readMeetTranscriptionAvailability } from './transcription-availability';

const PROTECTED = '00000000-0000-4000-8000-0000000000ee';
const CUSTOMER = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const attested = (workspaceId: string) => ({
  workspaceId,
  actorId: '00000000-0000-4000-8000-0000000000a1',
  attestedAt: 1,
  audience: 'adults-only',
});
/** The production frontend release: kill switch lifted, reviewed allow-all. */
const RELEASED = {
  MEET_AI_DISABLED: 'false',
  MEET_AI_PROTECTED_WORKSPACE_IDS: PROTECTED,
  MEET_AI_ENABLED_WORKSPACE_IDS: '',
  MEET_AI_ALL_WORKSPACES: MEET_AI_ALL_WORKSPACES_REVIEWED,
};
const withEnv = (env: object | undefined) =>
  mocks.context.mockResolvedValue({ env });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.attestation.mockImplementation(async (id: string) => attested(id));
});

describe('meeting transcript availability', () => {
  it('opens for any workspace the reviewed allow-all opt-in admits', async () => {
    withEnv(RELEASED);
    for (const wsId of [ROOT_WORKSPACE_ID, CUSTOMER])
      expect(await readMeetTranscriptionAvailability(wsId)).toEqual({
        available: true,
      });
  });

  it('keeps a non-allowlisted workspace off without the reviewed opt-in', async () => {
    withEnv({ ...RELEASED, MEET_AI_ALL_WORKSPACES: undefined });
    expect(await readMeetTranscriptionAvailability(CUSTOMER)).toEqual({
      available: false,
      reason: 'workspace',
    });
    for (const MEET_AI_ALL_WORKSPACES of ['*', 'true', '1', 'reviewed']) {
      withEnv({ ...RELEASED, MEET_AI_ALL_WORKSPACES });
      expect(await readMeetTranscriptionAvailability(CUSTOMER)).toMatchObject({
        reason: 'workspace',
      });
    }
    expect(mocks.attestation).not.toHaveBeenCalled();
  });

  it('opens an allowlisted workspace without the opt-in', async () => {
    withEnv({
      ...RELEASED,
      MEET_AI_ALL_WORKSPACES: undefined,
      MEET_AI_ENABLED_WORKSPACE_IDS: CUSTOMER,
    });
    expect(await readMeetTranscriptionAvailability(CUSTOMER)).toEqual({
      available: true,
    });
  });

  it.each([
    ['source containment', { ...RELEASED, MEET_AI_DISABLED: 'true' }],
    ['missing kill switch value', { ...RELEASED, MEET_AI_DISABLED: undefined }],
    ['no Worker env', undefined],
  ])('stays disabled under %s', async (_, env) => {
    withEnv(env);
    expect(await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)).toEqual({
      available: false,
      reason: 'disabled',
    });
  });

  it('stays disabled when the Worker context is unavailable', async () => {
    mocks.context.mockRejectedValue(new Error('no context'));
    expect(await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)).toEqual({
      available: false,
      reason: 'disabled',
    });
  });

  it.each([
    ['protected', { MEET_AI_PROTECTED_WORKSPACE_IDS: ROOT_WORKSPACE_ID }],
    ['denylisted', { MEET_AI_DISABLED_WORKSPACE_IDS: ROOT_WORKSPACE_ID }],
    ['missing protection config', { MEET_AI_PROTECTED_WORKSPACE_IDS: '' }],
  ])('keeps the internal workspace off when it is %s', async (_, controls) => {
    withEnv({ ...RELEASED, ...controls });
    expect(await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)).toEqual({
      available: false,
      reason: 'workspace',
    });
  });

  it('needs the workspace 18+ attestation', async () => {
    withEnv(RELEASED);
    mocks.attestation.mockResolvedValue(null);
    expect(await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)).toEqual({
      available: false,
      reason: 'audience',
    });
    mocks.attestation.mockResolvedValue(attested(CUSTOMER));
    expect(
      await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)
    ).toMatchObject({ reason: 'audience' });
  });

  it('reports a failed attestation lookup as retryable', async () => {
    withEnv(RELEASED);
    mocks.attestation.mockRejectedValue(new Error('lookup failed'));
    expect(await readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)).toEqual({
      available: false,
      reason: 'error',
    });
  });
});

describe('Parley', () => {
  it('keeps room transcription off', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_MEETING_APP', 'parley');
    const parley = await import('./transcription-availability');
    withEnv(RELEASED);
    expect(
      await parley.readMeetTranscriptionAvailability(ROOT_WORKSPACE_ID)
    ).toEqual({ available: false, reason: 'disabled' });
    vi.unstubAllEnvs();
  });
});
