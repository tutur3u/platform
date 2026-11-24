import { describe, expect, it, vi } from 'vitest';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  isMeetPerSpeakerEnabled,
  meetPerSpeakerEnabled,
  meetPerSpeakerWorkspaceIds,
} from './per-speaker-flag';

const ws = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';
const on = {
  MEET_AI_DISABLED: 'false',
  MEET_AI_PER_SPEAKER: 'true',
  MEET_AI_PER_SPEAKER_WORKSPACES: ` ${ws.toUpperCase()} , ${other}`,
};

describe('per-speaker flag', () => {
  it('admits an allowlisted workspace only when every switch is on', () => {
    expect(isMeetPerSpeakerEnabled(ws, on)).toBe(true);
    expect(isMeetPerSpeakerEnabled(other, on)).toBe(true);
  });

  it.each([
    ['flag off', { ...on, MEET_AI_PER_SPEAKER: 'false' }],
    ['flag truthy but not "true"', { ...on, MEET_AI_PER_SPEAKER: '1' }],
    ['kill switch on', { ...on, MEET_AI_DISABLED: 'true' }],
    ['kill switch missing', { ...on, MEET_AI_DISABLED: undefined }],
    ['allowlist empty', { ...on, MEET_AI_PER_SPEAKER_WORKSPACES: '' }],
    ['allowlist missing', { ...on, MEET_AI_PER_SPEAKER_WORKSPACES: undefined }],
    [
      'allowlist unparseable',
      { ...on, MEET_AI_PER_SPEAKER_WORKSPACES: `${ws},not-a-uuid` },
    ],
    ['allowlist miss', { ...on, MEET_AI_PER_SPEAKER_WORKSPACES: other }],
  ])('fails closed: %s', (_label, env) => {
    expect(isMeetPerSpeakerEnabled(ws, env)).toBe(false);
  });

  it('treats a malformed list as empty and no env as off', () => {
    expect(
      meetPerSpeakerWorkspaceIds({ MEET_AI_PER_SPEAKER_WORKSPACES: 'x,y' }).size
    ).toBe(0);
    expect(isMeetPerSpeakerEnabled(ws, undefined)).toBe(false);
    expect(isMeetPerSpeakerEnabled(null, on)).toBe(false);
  });

  it('re-reads the Worker env and is off without a Cloudflare context', async () => {
    vi.mocked(getCloudflareContext).mockResolvedValueOnce({ env: on } as never);
    expect(await meetPerSpeakerEnabled(ws)).toBe(true);
    vi.mocked(getCloudflareContext).mockRejectedValueOnce(new Error('none'));
    expect(await meetPerSpeakerEnabled(ws)).toBe(false);
  });
});
