import { describe, expect, it } from 'vitest';
import { isMeetAiEnabledForWorkspace } from './ai-workspace-gate';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
} from './room';
import { resolveRoomSettingsPatch, roomCommand } from './room-settings-gate';

/**
 * Containment hotfix (prod line 03a410b3): the exact Worker env values the
 * deploy sets, and each one alone, must deny Meet AI on the realtime Worker
 * while ordinary (non-AI) room traffic keeps working.
 */
const EASY_CENTER = '42529372-c669-4833-bb32-2cab1f4ffd83';
const OTHER = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const NOW = '2026-11-03T12:00:00.000Z';
const CONTAINMENT = {
  MEET_AI_DISABLED: 'true',
  MEET_AI_ENABLED_WORKSPACE_IDS: '',
  MEET_AI_DISABLED_WORKSPACE_IDS: EASY_CENTER,
};

const host = (wsId: string) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: Math.floor(Date.parse(NOW) / 1000) + 600,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    mode: 'call',
    role: 'host',
    roomId: 'workspace:meeting',
    scopes: [],
    userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
    wsId,
  });

const status = (result: unknown) =>
  result instanceof Response ? result.status : 'allowed';

describe('Meet AI containment env on the realtime Worker', () => {
  it('denies every workspace when the allowlist is present but empty', () => {
    for (const blank of ['', ' ', '\n'])
      for (const wsId of [OTHER, EASY_CENTER])
        expect(
          isMeetAiEnabledForWorkspace(wsId, {
            MEET_AI_ENABLED_WORKSPACE_IDS: blank,
          })
        ).toBe(false);
  });

  it('denies Easy Center on the denylist even without other controls', () => {
    const env = { MEET_AI_DISABLED_WORKSPACE_IDS: EASY_CENTER };
    expect(isMeetAiEnabledForWorkspace(EASY_CENTER, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(EASY_CENTER.toUpperCase(), env)).toBe(
      false
    );
  });

  it('denies every workspace with the kill switch alone', () => {
    for (const wsId of [OTHER, EASY_CENTER])
      expect(
        isMeetAiEnabledForWorkspace(wsId, { MEET_AI_DISABLED: 'true' })
      ).toBe(false);
  });

  it('denies note sharing on both write paths under the deploy env', () => {
    for (const wsId of [OTHER, EASY_CENTER]) {
      const token = host(wsId);
      expect(
        status(
          resolveRoomSettingsPatch(
            { shareNotes: true },
            undefined,
            token,
            CONTAINMENT
          )
        )
      ).toBe(403);
      const joined = admitOrHold(createMeetRoomSnapshot(), token, NOW).state;
      const command = roomCommand(
        {
          type: 'room.settings.update',
          settings: { shareNotesAfterMeeting: true },
        },
        token,
        CONTAINMENT
      );
      expect(command.notesEligible).toBe(false);
      const result = applyMeetRoomCommand(joined, { ...command, now: NOW });
      expect(result.state.settings?.shareNotesAfterMeeting).not.toBe(true);
      expect(JSON.stringify(result.reply)).toContain('permission_denied');
    }
  });

  it('keeps non-AI room traffic working under the deploy env', () => {
    const token = host(OTHER);
    const joined = admitOrHold(createMeetRoomSnapshot(), token, NOW);
    expect(joined.state.presence[token.userId]).toBeDefined();
    expect(joined.reply[0]).toMatchObject({ type: 'ready' });

    const titled = applyMeetRoomCommand(joined.state, {
      ...roomCommand(
        { type: 'room.title.update', title: 'Standup' },
        token,
        CONTAINMENT
      ),
      now: NOW,
    });
    expect(titled.broadcast).toContainEqual({
      type: 'room.title.changed',
      title: 'Standup',
    });

    // Turning note sharing off is always allowed.
    expect(
      resolveRoomSettingsPatch(
        { shareNotes: false },
        undefined,
        token,
        CONTAINMENT
      )
    ).toMatchObject({ shareNotes: false });
  });
});
