import { beforeEach, describe, expect, it } from 'vitest';
import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import { admitOrHold, createMeetRoomSnapshot } from './index';
import {
  applyMiraRoomConsent,
  consentedMiraRoomChat,
  fenceMiraRoomRequest,
  guardMeetTranscriptAllow,
  MIRA_ROOM_NOTICE_VERSION as version,
  miraRoomStatus,
} from './room-mira-consent';
import {
  acceptMira,
  endMira,
  miraChoice,
  miraMeetingId as meetingId,
  miraToken as token,
} from './room-mira.fixtures';
import {
  type RoomChatMessage,
  roomService,
  type RoomServiceState,
} from './room-service';
import { applyMeetTranscriptConsent } from './room-transcript-consent';

const host = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b2';
const carol = '00000000-0000-4000-8000-0000000000c3';
const guestA = '00000000-0000-4000-8000-0000000000d4';
const guestB = '00000000-0000-4000-8000-0000000000e5';
const blocked = { status: 409, body: { code: 'MIRA_ROOM_CONSENT_REQUIRED' } };

let room: RoomServiceState;
/** One serialized authority, in the meet-realtime wrapper order. */
function act(id: string, input: unknown, role: 'host' | 'speaker' = 'speaker') {
  const t = token(id, role);
  const result =
    applyMiraRoomConsent(room, t, input) ??
    guardMeetTranscriptAllow(room, t, input) ??
    applyMeetTranscriptConsent(room, t, input) ??
    fenceMiraRoomRequest(room, t, input, () => roomService(room, t, input));
  room = result.state;
  return result;
}
const admit = (id: string, extra: Record<string, unknown> = {}) => {
  room = admitOrHold(
    room,
    token(id, 'speaker', extra),
    '2026-11-24T00:00:00Z'
  ).state;
};
const choose = (id: string, choice: 'on' | 'off') =>
  act(id, miraChoice(room, choice));
const accept = (revision?: number, capabilities?: string[]) => {
  room = acceptMira(room, host, revision, undefined, capabilities);
};
const view = (id: string) =>
  act(id, { action: 'mira.room.read' }).body as {
    choice: 'on' | 'off' | null;
    lastChoice: 'on' | 'off' | null;
    ready: boolean;
    canAccept: boolean;
    acceptance: { revision: number; acceptorName: string } | null;
  };
const message = (id: string, accountId: string, body: string) =>
  ({
    type: 'chat.message',
    id,
    body,
    userId: accountId,
    accountId,
    displayName: accountId,
    createdAt: '2026-11-24T00:00:00Z',
  }) as RoomChatMessage;
const reserve = (id: string, messageId: string) =>
  act(id, { action: 'ai.reserve', messageId });
const leave = (id: string) => {
  room = {
    ...room,
    presence: Object.fromEntries(
      Object.entries(room.presence).filter(
        ([, person]) => (person.accountId ?? person.userId) !== id
      )
    ),
  };
};

beforeEach(() => {
  room = createMeetRoomSnapshot();
  for (const id of [host, bob, carol]) admit(id);
  room = {
    ...room,
    chat: [
      message('bob-1', bob, 'Bob said something'),
      message('ask', host, '@mira summarize'),
    ],
  };
});

describe('room Mira host acceptance', () => {
  it('lets only a present host or co-host accept, never a guest', () => {
    expect(view(host).canAccept).toBe(false);
    expect(view(bob).canAccept).toBe(false);
    const asCoHost = applyMiraRoomConsent(
      room,
      token(bob, 'speaker', { scopes: ['meet:server', 'class:cohost'] }),
      {
        action: 'mira.room.accept',
        revision: 1,
        capabilities: ['chat'],
        noticeVersion: version,
        audienceAdultConfirmed: true,
      }
    );
    expect(asCoHost?.status ?? 200).toBe(200);
    admit(guestA);
    const asGuest = applyMiraRoomConsent(
      room,
      token(guestA, 'host', { guest: true }),
      {
        action: 'mira.room.accept',
        revision: 2,
        capabilities: ['chat'],
        noticeVersion: version,
        audienceAdultConfirmed: true,
      }
    );
    expect(asGuest?.status).toBe(403);
    leave(host);
    expect(() => acceptMira(room, host, 3)).toThrow();
  });

  it('needs the 18+ confirmation and refuses stale revisions', () => {
    const input = {
      action: 'mira.room.accept',
      revision: 1,
      capabilities: ['chat'],
      noticeVersion: version,
    };
    expect(applyMiraRoomConsent(room, token(host, 'host'), input)).toBeNull();
    accept(2);
    expect(
      applyMiraRoomConsent(room, token(host, 'host'), {
        ...input,
        revision: 2,
        audienceAdultConfirmed: true,
      })?.status
    ).toBe(409);
  });

  it('posts a system line naming the acceptor and shows it to everyone', () => {
    const result = applyMiraRoomConsent(
      room,
      token(host, 'host', { displayName: 'Lan Host' }),
      {
        action: 'mira.room.accept',
        revision: 1,
        capabilities: ['chat'],
        noticeVersion: version,
        audienceAdultConfirmed: true,
      }
    )!;
    room = result.state;
    expect(result.messages?.[0]).toMatchObject({
      assistant: true,
      notice: { kind: 'mira.on', by: 'Lan Host' },
    });
    expect(view(bob).acceptance).toMatchObject({
      revision: 1,
      acceptorName: 'Lan Host',
    });
  });
});

describe('room Mira per-person consent', () => {
  it('1: an acceptance with no choices allows no reservation', () => {
    accept();
    expect(miraRoomStatus(room, meetingId)).toEqual({
      active: true,
      included: 0,
      admitted: 3,
    });
    expect(reserve(host, 'ask')).toMatchObject(blocked);
  });

  it('2: a choice made before a mid-call enable stays excluded until confirmed', () => {
    choose(bob, 'on');
    accept();
    expect(view(bob)).toMatchObject({ choice: null, ready: false });
    choose(bob, 'on');
    expect(view(bob)).toMatchObject({ choice: 'on', ready: true });
  });

  it('keeps the latest own choice as lastChoice across a new acceptance', () => {
    accept();
    choose(bob, 'off');
    expect(view(bob)).toMatchObject({ choice: 'off', lastChoice: 'off' });
    room = endMira(room, host, 'turned_off').state;
    accept();
    // Current choice is gone with the old revision; the last one is not.
    expect(view(bob)).toMatchObject({ choice: null, lastChoice: 'off' });
    expect(view(carol)).toMatchObject({ choice: null, lastChoice: null });
    choose(bob, 'on');
    expect(view(bob)).toMatchObject({ choice: 'on', lastChoice: 'on' });
  });

  it('refuses an on choice while no acceptance is current', () => {
    expect(
      act(bob, {
        action: 'mira.room.choice',
        choice: 'on',
        version,
        acceptanceRevision: 0,
      })
    ).toMatchObject({ status: 409, body: { code: 'MIRA_ROOM_STALE' } });
    expect(room.miraRoom?.choices[bob]).toBeUndefined();
  });

  it('never lets a Join state turn an earlier off back on, in any revision', () => {
    accept();
    choose(bob, 'off');
    room = endMira(room, host, 'turned_off').state;
    accept();
    expect(room.miraRoom?.acceptance?.revision).toBe(2);
    // A new device carries a ticked join box for the new revision.
    const joined = act(bob, { ...miraChoice(room, 'on'), source: 'join' });
    expect(joined).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_JOIN_OVER_OFF' },
    });
    expect(view(bob)).toMatchObject({
      choice: null,
      lastChoice: 'off',
      ready: false,
    });
    // An action in the call does turn it on.
    act(bob, { ...miraChoice(room, 'on'), source: 'confirm' });
    expect(view(bob)).toMatchObject({ choice: 'on', ready: true });
  });

  it('lets a Join state turn on for someone with no earlier off', () => {
    accept();
    expect(
      act(carol, { ...miraChoice(room, 'on'), source: 'join' }).status ?? 200
    ).toBe(200);
    expect(view(carol)).toMatchObject({ choice: 'on', ready: true });
  });

  it('refuses an on choice for an acceptance the participant did not see', () => {
    accept();
    expect(
      act(bob, {
        action: 'mira.room.choice',
        choice: 'on',
        version,
        acceptanceRevision: 0,
      })
    ).toMatchObject({ status: 409, body: { code: 'MIRA_ROOM_STALE' } });
  });

  it('3: ending an acceptance discards an admitted answer and needs new choices', () => {
    accept();
    choose(host, 'on');
    expect(reserve(host, 'ask').status ?? 200).toBe(200);
    const leaseId = '00000000-0000-4000-8000-00000000ee01';
    act(host, { action: 'mira.room.dispatch', messageId: 'ask', leaseId });
    const ended = endMira(room, host, 'turned_off');
    room = ended.state;
    expect(ended.messages?.[0]).toMatchObject({ notice: { kind: 'mira.off' } });
    expect(
      act(host, { action: 'mira.room.release', messageId: 'ask', leaseId }).body
    ).toEqual({ current: false });
    expect(
      act(host, {
        action: 'ai.finish',
        messageId: 'ask',
        body: 'Answer',
        costUsd: 0,
      })
    ).toMatchObject(blocked);
    accept();
    expect(view(host)).toMatchObject({ choice: null, ready: false });
  });

  it('4: a notice version change makes every choice stale', () => {
    accept();
    choose(bob, 'on');
    room = {
      ...room,
      miraRoom: {
        ...room.miraRoom!,
        choices: {
          ...room.miraRoom!.choices,
          [bob]: { ...room.miraRoom!.choices[bob]!, version: 'older' },
        },
      },
    };
    expect(view(bob).ready).toBe(false);
    room = {
      ...room,
      miraRoom: {
        ...room.miraRoom!,
        acceptance: { ...room.miraRoom!.acceptance!, noticeVersion: 'older' },
      },
    };
    expect(miraRoomStatus(room, meetingId).active).toBe(false);
  });

  it('5: one opt-out excludes only that person; others keep Mira', () => {
    accept();
    for (const id of [host, bob, carol]) choose(id, 'on');
    choose(bob, 'off');
    expect(miraRoomStatus(room, meetingId).included).toBe(2);
    const reserved = reserve(host, 'ask');
    expect(reserved.status ?? 200).toBe(200);
    const body = reserved.body as {
      chat: RoomChatMessage[];
      meetingContext: { participants: { displayName: string }[] };
    };
    expect(body.chat.map((m) => m.id)).toEqual(['ask']);
    // Bob, who is off, is not named to the provider.
    expect(body.meetingContext.participants).toHaveLength(2);
    expect(room.aiRequests?.ask?.miraRoomSources).toEqual({ [host]: 1 });
    expect(room.aiRequests?.ask?.miraRoomAcceptance).toBe(1);
  });

  it('6: context omits authors who are off and every Mira line', () => {
    accept();
    choose(host, 'on');
    const history = [
      message('h', host, 'from host'),
      message('b', bob, 'from bob, who never chose'),
      { ...message('m', 'mira', 'from mira'), assistant: true },
      message('f', MEET_ASSISTANT_USER_ID, 'forged mira'),
    ] as RoomChatMessage[];
    expect(
      consentedMiraRoomChat(room, meetingId, history).map((m) => m.id)
    ).toEqual(['h']);
  });

  it('7: two guests with the same label keep separate choices', () => {
    // Guests are keyed by their server-issued ids, never their labels.
    admit(guestA, { displayName: 'Lan' });
    admit(guestB, { displayName: 'Lan' });
    accept();
    choose(guestA, 'on');
    expect(view(guestA).choice).toBe('on');
    expect(view(guestB).choice).toBeNull();
  });

  it('8: a rejoin keeps a choice only within the same revision', () => {
    accept();
    choose(bob, 'on');
    leave(bob);
    admit(bob);
    expect(view(bob).choice).toBe('on');
    leave(bob);
    accept(undefined, ['chat', 'notes']);
    admit(bob);
    expect(view(bob).choice).toBeNull();
  });

  it('12: an expansion is a new acceptance that needs new choices', () => {
    accept();
    choose(bob, 'on');
    accept(undefined, ['chat', 'notes']);
    expect(room.miraRoom?.acceptance?.revision).toBe(2);
    expect(view(bob).ready).toBe(false);
  });

  it('lets any present participant report a minor, which ends Mira', () => {
    accept();
    choose(bob, 'on');
    expect(endMira(room, carol, 'turned_off', 'speaker').status).toBe(403);
    room = endMira(room, carol, 'minor_reported', 'speaker').state;
    expect(miraRoomStatus(room, meetingId).active).toBe(false);
    expect(view(bob).ready).toBe(false);
  });
});

describe('room Mira and the live transcript fence', () => {
  const allow = (id: string) =>
    act(id, {
      action: 'transcript.consent.choice',
      choice: 'allow',
      version: '2026-11-23-transcript-v1',
    });

  it('refuses a transcript Allow while the participant is off or undecided', () => {
    expect(allow(bob)).toMatchObject(blocked);
    accept();
    expect(allow(bob)).toMatchObject(blocked);
    choose(bob, 'on');
    expect(allow(bob).status ?? 200).toBe(200);
    expect(room.transcriptConsent?.choices[bob]?.choice).toBe('allow');
  });

  it('declines the transcript in the same turn as turning Mira off', () => {
    accept();
    choose(bob, 'on');
    allow(bob);
    choose(bob, 'off');
    expect(room.transcriptConsent?.choices[bob]?.choice).toBe('decline');
    // Off records even after leaving, so a rejoin never resumes capture.
    choose(carol, 'on');
    allow(carol);
    leave(carol);
    choose(carol, 'off');
    expect(room.transcriptConsent?.choices[carol]?.choice).toBe('decline');
    expect(room.miraRoom?.choices[carol]?.choice).toBe('off');
  });

  it('drops transcript Allows when an acceptance starts, changes or ends', () => {
    accept();
    choose(bob, 'on');
    allow(bob);
    accept(undefined, ['chat', 'notes']);
    expect(room.transcriptConsent?.choices[bob]).toBeUndefined();
    choose(bob, 'on');
    allow(bob);
    room = endMira(room, host, 'turned_off').state;
    expect(room.transcriptConsent?.choices[bob]).toBeUndefined();
  });
});
