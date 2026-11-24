import { admitOrHold, createMeetRoomSnapshot } from './index';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  guardMeetTranscriptAllow,
} from './room-mira-consent';
import { acceptMira, miraChoice, miraToken } from './room-mira.fixtures';
import { routeSelfCapture } from './room-self-capture-route';
import { roomService, type RoomServiceState } from './room-service';
import {
  applyMeetTranscriptConsent,
  MEET_TRANSCRIPT_NOTICE_VERSION,
} from './room-transcript-consent';

export const ws = '00000000-0000-4000-8000-000000000003';
export const host = '00000000-0000-4000-8000-0000000000a1';
export const alice = '00000000-0000-4000-8000-0000000000b1';
export const bob = '00000000-0000-4000-8000-0000000000b2';
export const sessionId = '00000000-0000-4000-8000-0000000000c1';
export const otherSession = '00000000-0000-4000-8000-0000000000c2';
export const streamA = '00000000-0000-4000-8000-0000000000d1';
export const streamB = '00000000-0000-4000-8000-0000000000d2';

export const env = {
  MEET_AI_PER_SPEAKER: 'true',
  MEET_AI_PER_SPEAKER_WORKSPACES: ws,
  MEET_AI_DISABLED: 'false',
  MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ff',
};

export const tokenOf = (id: string, extra: Record<string, unknown> = {}) =>
  miraToken(id, id === host ? 'host' : 'speaker', extra);

/** The Meet realtime room-service chain with the per-speaker router. */
export function svc(
  state: RoomServiceState,
  id: string,
  input: object,
  now = 1_000_000,
  extra: Record<string, unknown> = {},
  roomEnv: object = env
) {
  const token = tokenOf(id, extra);
  return routeSelfCapture(
    state,
    token,
    input,
    roomEnv,
    (current) =>
      applyMiraRoomConsent(current, token, input, now) ??
      guardMeetTranscriptAllow(current, token, input) ??
      applyMeetTranscriptConsent(current, token, input, now) ??
      fenceMiraRoomRequest(current, token, input, () =>
        roomService(current, token, input)
      ),
    now
  );
}

export const ok = <T extends { status?: number; state: RoomServiceState }>(
  result: T
) => {
  if ((result.status ?? 200) >= 400)
    throw new Error(`refused ${result.status}: ${JSON.stringify(result)}`);
  return result.state;
};

export const admit = (state: RoomServiceState, id: string) =>
  admitOrHold(state, tokenOf(id), '2026-11-24T00:00:00Z').state;

export function miraOn(state: RoomServiceState, id: string, now = 1_000_000) {
  return ok(
    applyMiraRoomConsent(state, tokenOf(id), miraChoice(state, 'on'), now)!
  );
}

export const transcriptChoice = (choice: 'allow' | 'decline') => ({
  action: 'transcript.consent.choice',
  choice,
  version: MEET_TRANSCRIPT_NOTICE_VERSION,
});

/**
 * A meeting in per-speaker mode with a running self_v1 session; the host,
 * Alice and Bob are present with Mira on and the transcript allowed.
 */
export function selfRoom(now = 1_000_000) {
  let state: RoomServiceState = createMeetRoomSnapshot();
  for (const id of [host, alice, bob]) state = admit(state, id);
  state = acceptMira(state, host, 1, now);
  for (const id of [host, alice, bob]) {
    state = miraOn(state, id, now);
    state = ok(svc(state, id, transcriptChoice('allow'), now));
  }
  state = ok(
    svc(state, host, { action: 'transcript.mode.set', mode: 'self' }, now)
  );
  state = ok(
    svc(
      state,
      host,
      {
        action: 'transcript.session',
        sessionId,
        active: true,
        protocol: 'self_v1',
        generation: 2,
      },
      now
    )
  );
  return state;
}

type Body = Record<string, unknown> & {
  pending?: Array<{ accountId: string; seq: number; kind: string }>;
};

export function begin(state: RoomServiceState, id: string, now = 1_000_000) {
  const result = svc(
    state,
    id,
    { action: 'transcription.self.openBegin', sessionId },
    now
  );
  return { state: result.state, body: result.body as Body };
}

export function commit(
  state: RoomServiceState,
  id: string,
  epoch: number,
  streamId: string,
  revision = 1,
  now = 1_000_000
) {
  const result = svc(
    state,
    id,
    {
      action: 'transcription.self.openCommit',
      sessionId,
      epoch,
      revision,
      streamId,
    },
    now
  );
  return { state: result.state, body: result.body as Body };
}

/** Begin and commit a stream for the account. */
export function open(
  state: RoomServiceState,
  id: string,
  streamId: string,
  revision = 1,
  now = 1_000_000
) {
  const begun = begin(state, id, now);
  if (begun.body.allowed !== true)
    throw new Error(`begin refused: ${JSON.stringify(begun.body)}`);
  return commit(
    begun.state,
    id,
    begun.body.epoch as number,
    streamId,
    revision,
    now
  ).state;
}

export function authorize(
  state: RoomServiceState,
  id: string,
  streamId: string,
  consentRevision = 1,
  spend = true,
  now = 1_000_000
) {
  const result = svc(
    state,
    id,
    {
      action: 'transcription.self.authorize',
      sessionId,
      streamId,
      consentRevision,
      spend,
    },
    now
  );
  return { state: result.state, body: result.body as Body };
}

export const outbox = (state: RoomServiceState) =>
  (state.selfCapture?.outbox ?? []).map(({ accountId, seq, kind }) => ({
    accountId,
    seq,
    kind,
  }));
