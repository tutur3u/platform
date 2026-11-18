import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { type RoomServiceState, roomService } from './room-service';

const account = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'speaker',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: account,
  accountId: account,
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
const now = '2026-09-09T00:00:00Z';
const initial = (): RoomServiceState => ({
  ...admitOrHold(createMeetRoomSnapshot(), token, now).state,
  chat: [
    {
      type: 'chat.message',
      id: 'message',
      displayName: 'Guest',
      userId: account,
      accountId: account,
      body: '@Tuturuuu summarize our discussion',
      createdAt: now,
    },
  ],
});

describe('trusted room services', () => {
  it('rejects browser tokens even when they belong to the host', () => {
    expect(
      roomService(
        initial(),
        { ...token, role: 'host', scopes: [] },
        { action: 'costs' }
      ).status
    ).toBe(403);
  });
  it('keeps costs and recording access admin-only by default', () => {
    expect(roomService(initial(), token, { action: 'costs' }).status).toBe(403);
    expect(
      roomService(initial(), token, {
        action: 'recording.read',
        sessionId: account,
      }).status
    ).toBe(403);
    expect(
      roomService(initial(), { ...token, role: 'host' }, { action: 'costs' })
        .status
    ).toBeUndefined();
  });
  it('deduplicates assistant requests and rejects another account’s mention', () => {
    const reserved = roomService(initial(), token, {
      action: 'ai.reserve',
      messageId: 'message',
    });
    expect(reserved.status).toBeUndefined();
    expect(
      roomService(reserved.state, token, {
        action: 'ai.reserve',
        messageId: 'message',
      }).status
    ).toBe(409);
    const other = { ...token, accountId: 'other', userId: 'other' };
    const otherState = initial();
    otherState.presence[other.userId] = {
      ...otherState.presence[token.userId]!,
      userId: other.userId,
      accountId: other.accountId,
    };
    expect(
      roomService(otherState, other, {
        action: 'ai.reserve',
        messageId: 'message',
      }).status
    ).toBe(404);
  });
  it('preserves incurred AI costs when the meeting ends during generation', () => {
    const reserved = roomService(initial(), token, {
      action: 'ai.reserve',
      messageId: 'message',
    });
    const ended = { ...reserved.state, presence: {}, ended: true };
    const result = roomService(ended, token, {
      action: 'ai.finish',
      messageId: 'message',
      body: 'Summary',
      costUsd: 0.001,
    });
    expect(result.status).toBeUndefined();
    expect(result.state.aiRequests?.message?.costUsd).toBe(0.001);
    expect(result.messages?.[0]).toMatchObject({
      assistant: true,
      displayName: 'Mira',
    });
    expect(
      roomService(result.state, token, {
        action: 'ai.finish',
        messageId: 'message',
        body: 'Duplicate',
      }).state
    ).toBe(result.state);
  });
});

it('shares recording metadata after a call only when explicitly enabled', () => {
  const state: RoomServiceState = {
    ...initial(),
    presence: {},
    ended: true,
    approved: { [account]: { userId: account, displayName: 'Guest' } },
    recordings: [
      {
        sessionId: account,
        ownerAccountId: account,
        ownerDeviceId: account,
        startedAt: now,
        status: 'ready',
        path: 'private-storage-path',
        storageWsId: account,
      },
    ],
  };
  expect(roomService(state, token, { action: 'recording.list' }).status).toBe(
    403
  );
  state.settings = { shareNotes: false, shareRecordings: true };
  const result = roomService(state, token, { action: 'recording.list' });
  expect(result.status).toBeUndefined();
  expect(JSON.stringify(result.body)).not.toContain('private-storage-path');
  expect(roomService(state, token, { action: 'read' }).status).toBe(403);
});

it('permits new questions after an abandoned request while retaining late cost accounting', () => {
  const state = initial();
  state.aiRequests = {
    abandoned: {
      userId: account,
      status: 'pending',
      startedAt: Date.now() - 180000,
    },
  };
  const next = roomService(state, token, {
    action: 'ai.reserve',
    messageId: 'message',
  });
  expect(next.status).toBeUndefined();
  const late = roomService(next.state, token, {
    action: 'ai.finish',
    messageId: 'abandoned',
    costUsd: 0.001,
  });
  expect(late.status).toBeUndefined();
  expect(late.state.aiRequests?.abandoned?.costUsd).toBe(0.001);
});

it('keeps legacy pending requests active until Worker migration timestamps them', () => {
  const state = initial();
  state.aiRequests = { legacy: { userId: account, status: 'pending' } };
  expect(
    roomService(state, token, { action: 'ai.reserve', messageId: 'message' })
      .status
  ).toBe(409);
});

it('discards only the uploader’s unsent files and preserves sent files after an acknowledgement is lost', () => {
  const file = {
    id: account,
    name: 'file.txt',
    size: 10,
    contentType: 'text/plain',
    path: 'Meet/chat/file.txt',
    storageWsId: token.wsId,
  };
  const state = roomService(initial(), token, {
    action: 'attach',
    attachment: file,
  }).state;
  const other = { ...token, accountId: token.meetingId };
  expect(
    roomService(state, other, { action: 'attachment.discard', id: account })
      .status
  ).toBe(404);
  const sent = applyMeetRoomCommand(state, {
    token: { ...token, scopes: [...token.scopes, 'chat:write'] },
    now,
    message: { type: 'chat.message', body: 'File', attachmentIds: [account] },
  });
  expect(sent.state.attachments?.[account]?.published).toBe(true);
  expect(
    roomService(sent.state, token, {
      action: 'attachment.discard',
      id: account,
    }).status
  ).toBe(409);
  const discarded = roomService(state, token, {
    action: 'attachment.discard',
    id: account,
  });
  expect(discarded.status).toBeUndefined();
  expect(
    roomService(discarded.state, token, { action: 'attachment', id: account })
      .status
  ).toBe(404);
});

it('acknowledges a repeated completed assistant settlement without duplicating messages or cost', () => {
  const reserved = roomService(initial(), token, {
    action: 'ai.reserve',
    messageId: 'message',
  }).state;
  const command = {
    action: 'ai.finish',
    messageId: 'message',
    body: 'Answer',
    costUsd: 0.001,
  };
  const done = roomService(reserved, token, command);
  const retried = roomService(done.state, token, command);
  expect(retried.status).toBeUndefined();
  expect(retried.state).toBe(done.state);
  expect(retried.messages).toBeUndefined();
});
it('reclaims a discarded attachment slot only after storage deletion succeeds', () => {
  const file = {
    id: account,
    name: 'file.txt',
    size: 10,
    contentType: 'text/plain',
    path: 'Meet/file.txt',
    storageWsId: token.wsId,
  };
  const state = roomService(initial(), token, {
    action: 'attach',
    attachment: file,
  }).state;
  for (let i = 0; i < 999; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    state.attachments![id] = { ...file, id };
  }
  const nextUpload = {
    action: 'attach',
    attachment: { ...file, id: token.meetingId },
  };
  expect(
    roomService(state, token, { action: 'attachment.deleted', id: account })
      .status
  ).toBe(403);
  const discarded = roomService(state, token, {
    action: 'attachment.discard',
    id: account,
  }).state;
  expect(roomService(discarded, token, nextUpload).status).toBe(409);
  const deleted = roomService(discarded, token, {
    action: 'attachment.deleted',
    id: account,
  });
  expect(deleted.state.attachments?.[account]).toBeUndefined();
  expect(roomService(deleted.state, token, nextUpload).status).toBeUndefined();
  expect(
    roomService(deleted.state, token, {
      action: 'attachment.deleted',
      id: account,
    }).status
  ).toBeUndefined();
});

it.each([
  '(@Tuturuuu)',
  'Hello,@Tuturuuu!',
  '**@Tuturuuu**',
  '@ttr help',
  '@TTR help',
  '@tuturuuu help',
])('accepts standalone assistant mention boundaries: %s', (body) => {
  const state = initial();
  state.chat![0]!.body = body;
  expect(
    roomService(state, token, { action: 'ai.reserve', messageId: 'message' })
      .status
  ).toBeUndefined();
});

it.each(['[@ttr](https://example.com)', '`@tuturuuu`'])(
  'rejects AI reservation for an inert mention: %s',
  (body) => {
    const state = initial();
    state.chat![0]!.body = body;
    const result = roomService(state, token, {
      action: 'ai.reserve',
      messageId: 'message',
    });
    expect(result.status).toBe(404);
    expect(result.state.aiRequests).toEqual(state.aiRequests);
  }
);

it('replays personal responses only to their requester, never through room/admin reads', () => {
  const begin = {
    action: 'personal.begin',
    id: account,
    startedAt: Date.now(),
    fingerprint: 'a'.repeat(64),
  };
  const claimed = roomService(initial(), token, begin);
  expect(claimed.body).toEqual({ started: true });
  expect(claimed.messages).toBeUndefined();
  expect(roomService(claimed.state, token, begin).status).toBe(409);
  const done = roomService(claimed.state, token, {
    action: 'personal.finish',
    id: account,
    text: 'Private answer',
  });
  expect(roomService(done.state, token, begin).body).toEqual({
    text: 'Private answer',
  });
  expect(
    JSON.stringify(
      roomService(done.state, { ...token, role: 'host' }, { action: 'read' })
        .body
    )
  ).not.toContain('Private answer');
  const other = { ...token, accountId: 'another', userId: 'another' };
  expect(roomService(done.state, other, begin).body).toEqual({ started: true });
  expect(roomService(done.state, { ...token, scopes: [] }, begin).status).toBe(
    403
  );
  expect(
    roomService(done.state, token, { ...begin, fingerprint: 'b'.repeat(64) })
      .status
  ).toBe(409);
  expect(
    roomService(done.state, token, {
      ...begin,
      startedAt: Date.now() - 3_600_001,
    }).status
  ).toBe(410);
});

it('distinguishes a confirmed failed personal receipt from an uncertain pending attempt', () => {
  const begin = {
    action: 'personal.begin',
    id: account,
    startedAt: Date.now(),
    fingerprint: 'a'.repeat(64),
  };
  const claimed = roomService(initial(), token, begin);
  expect(roomService(claimed.state, token, begin).status).toBe(409);
  const failed = roomService(claimed.state, token, {
    action: 'personal.finish',
    id: account,
  });
  expect(roomService(failed.state, token, begin).status).toBe(422);
  expect(
    roomService(failed.state, token, { ...begin, id: crypto.randomUUID() }).body
  ).toEqual({ started: true });
});

it('limits transcript identities to signed host requests and admitted accounts', () => {
  const command = { action: 'transcription.speaker', accountId: account };
  expect(roomService(initial(), token, command).status).toBe(403);
  expect(
    roomService(initial(), { ...token, role: 'host', scopes: [] }, command)
      .status
  ).toBe(403);
  expect(
    roomService(initial(), { ...token, role: 'host' }, command).body
  ).toEqual({ accountId: account });
  const stranger = '11111111-1111-4111-8111-111111111111';
  expect(
    roomService(
      initial(),
      { ...token, role: 'host' },
      { ...command, accountId: stranger }
    ).status
  ).toBe(403);
  const snapshot = {
    ...initial(),
    approved: { [stranger]: { userId: stranger, displayName: 'Guest' } },
  };
  expect(
    roomService(
      snapshot,
      { ...token, role: 'host' },
      { ...command, accountId: stranger }
    ).body
  ).toEqual({ accountId: stranger });
});

describe('room poll actions', () => {
  const manager = {
    ...token,
    scopes: [...token.scopes, 'participants:manage'],
  };
  const host = { ...token, role: 'host' as const };
  const other = {
    ...token,
    userId: '433cf9e7-c217-4f33-b86b-c1893b5e78e1',
    accountId: '433cf9e7-c217-4f33-b86b-c1893b5e78e1',
  };
  const create = {
    action: 'poll.create',
    anonymous: true,
    definition: { type: 'open_text', question: 'What helped?' },
  };
  const start = (definition: unknown) => {
    const drafted = roomService(initial(), manager, { ...create, definition });
    const poll = drafted.state.polls?.[0];
    if (!poll) throw new Error('Expected a valid poll draft');
    const pollId = poll.id;
    return {
      pollId,
      poll,
      state: roomService(drafted.state, host, { action: 'poll.launch', pollId })
        .state,
    };
  };

  it('requires trusted scope, call admission and manager rights for administrative actions', () => {
    expect(roomService(initial(), { ...host, scopes: [] }, create).status).toBe(
      403
    );
    expect(roomService(initial(), token, create).status).toBe(403);
    expect(roomService(initial(), other, { action: 'poll.list' }).status).toBe(
      403
    );
    const { state, pollId } = start(create.definition);
    for (const action of [
      { action: 'poll.launch', pollId },
      { action: 'poll.close', pollId },
      { action: 'poll.visibility', pollId, resultsVisible: true },
      { action: 'poll.delete', pollId },
      { action: 'poll.export', pollId, format: 'csv' },
      { action: 'poll.summary', pollId },
      { action: 'poll.authorize' },
    ])
      expect(roomService(state, token, action).status).toBe(403);
    expect(
      roomService(state, other, {
        action: 'poll.vote',
        pollId,
        response: { type: 'open_text', text: 'Hello' },
      }).status
    ).toBe(403);
  });

  it('enforces the lifecycle and records one account response across devices', () => {
    const { state, pollId } = start(create.definition);
    const vote = {
      action: 'poll.vote',
      pollId,
      response: { type: 'open_text', text: ' First ' },
    };
    const first = roomService(state, token, vote);
    expect(first.state.polls?.[0]?.responses[0]).toMatchObject({
      submittedAt: expect.any(Number),
    });
    const device = { ...token, userId: other.userId };
    expect(roomService(first.state, device, vote).state).toBe(first.state);
    const second = roomService(first.state, device, {
      ...vote,
      response: { type: 'open_text', text: 'Updated' },
    });
    const hidden = roomService(second.state, token, { action: 'poll.list' });
    expect(hidden.body).toMatchObject({
      canManage: false,
      polls: [{ myResponse: { text: 'Updated' }, results: null }],
    });
    expect(
      roomService(second.state, manager, { action: 'poll.list' }).body
    ).toMatchObject({
      canManage: true,
      polls: [{ results: { responseCount: 1, answers: ['Updated'] } }],
    });
    const visible = roomService(second.state, manager, {
      action: 'poll.visibility',
      pollId,
      resultsVisible: true,
    });
    expect(
      roomService(visible.state, token, { action: 'poll.list' }).body
    ).toMatchObject({ polls: [{ results: { responseCount: 1 } }] });
    const closed = roomService(second.state, manager, {
      action: 'poll.close',
      pollId,
    });
    expect(
      roomService(closed.state, token, { action: 'poll.list' }).body
    ).toMatchObject({
      polls: [{ status: 'closed', results: { responseCount: 1 } }],
    });
    expect(roomService(closed.state, token, vote).status).toBe(409);
    expect(
      roomService(closed.state, host, { action: 'poll.launch', pollId }).status
    ).toBe(409);
    const deleted = roomService(closed.state, manager, {
      action: 'poll.delete',
      pollId,
    });
    expect(
      roomService(deleted.state, manager, {
        action: 'poll.export',
        pollId,
        format: 'json',
      }).status
    ).toBe(404);
  });

  it.each(['single_choice', 'multiple_choice'] as const)(
    'validates and tallies %s selections',
    (type) => {
      const { state, pollId, poll } = start({
        type,
        question: 'Which?',
        options: ['A', 'B', 'C'],
        ...(type === 'multiple_choice' ? { maxChoices: 2 } : {}),
      });
      if (!('options' in poll)) throw new Error('Expected options');
      const ids = poll.options.map(({ id }) => id);
      const vote = (response: unknown) =>
        roomService(state, token, { action: 'poll.vote', pollId, response });
      expect(
        vote({ type: 'single_choice', optionId: other.userId }).status
      ).toBe(400);
      if (type === 'multiple_choice') {
        expect(vote({ type, optionIds: ids }).status).toBe(400);
        expect(vote({ type, optionIds: [ids[0], ids[0]] }).status).toBe(400);
      }
      const accepted = vote(
        type === 'multiple_choice'
          ? { type, optionIds: ids.slice(0, 2) }
          : { type, optionId: ids[0] }
      );
      expect(
        roomService(accepted.state, host, { action: 'poll.summary', pollId })
          .body
      ).toMatchObject({
        results: {
          tally: [
            { label: 'A', count: 1 },
            { label: 'B', count: type === 'multiple_choice' ? 1 : 0 },
            { label: 'C', count: 0 },
          ],
        },
      });
    }
  );

  it.each([5, 10])(
    'calculates rating averages and %s-bin distributions',
    (max) => {
      const { state, pollId } = start({
        type: 'rating',
        question: 'How was it?',
        min: 1,
        max,
      });
      const admitted = admitOrHold(state, other, now).state;
      const vote = (
        current: RoomServiceState,
        voter: typeof token,
        rating: number
      ) =>
        roomService(current, voter, {
          action: 'poll.vote',
          pollId,
          response: { type: 'rating', rating },
        });
      expect(vote(admitted, token, max + 1).status).toBe(400);
      const first = vote(admitted, token, 1);
      const second = vote(first.state, other, max);
      expect(
        roomService(second.state, host, { action: 'poll.summary', pollId }).body
      ).toMatchObject({
        results: {
          average: (1 + max) / 2,
          tally: Array.from({ length: max }, (_, index) => ({
            label: String(index + 1),
            count: index === 0 || index === max - 1 ? 1 : 0,
          })),
        },
      });
    }
  );

  it('groups normalized word-cloud entries and rejects blank or oversized text', () => {
    const { state, pollId } = start({
      type: 'word_cloud',
      question: 'Describe the workshop',
    });
    const admitted = admitOrHold(state, other, now).state;
    const vote = (
      current: RoomServiceState,
      voter: typeof token,
      text: string
    ) =>
      roomService(current, voter, {
        action: 'poll.vote',
        pollId,
        response: { type: 'word_cloud', text },
      });
    expect(vote(admitted, token, ' '.repeat(5)).status).toBe(400);
    expect(vote(admitted, token, 'x'.repeat(61)).status).toBe(400);
    const first = vote(admitted, token, '  Great   Team  ');
    const second = vote(first.state, other, 'great team');
    expect(
      roomService(second.state, host, { action: 'poll.summary', pollId }).body
    ).toMatchObject({
      results: { responseCount: 2, tally: [{ label: 'Great Team', count: 2 }] },
    });
  });

  it('bounds poll count, response count and total snapshot bytes', () => {
    const { state, pollId, poll } = start(create.definition);
    const full = { ...state, polls: Array.from({ length: 50 }, () => poll) };
    expect(roomService(full, host, create).status).toBe(409);
    const vote = {
      action: 'poll.vote',
      pollId,
      response: { type: 'open_text', text: 'a' },
    };
    const responses = Array.from({ length: 500 }, (_, index) => ({
      userId: String(index),
      displayName: '',
      response: { type: 'open_text' as const, text: 'a' },
    }));
    expect(
      roomService(
        { ...state, polls: [{ ...poll, status: 'active', responses }] },
        token,
        vote
      ).status
    ).toBe(409);
    const large = responses.map((response) => ({
      ...response,
      response: { ...response.response, text: 'ế'.repeat(500) },
    }));
    expect(
      roomService(
        {
          ...state,
          polls: [
            { ...poll, status: 'active', responses: large.slice(0, 200) },
          ],
        },
        token,
        vote
      ).status
    ).toBe(409);
    expect(
      roomService(state, token, {
        ...vote,
        response: { type: 'open_text', text: 'a'.repeat(501) },
      }).status
    ).toBe(400);
  });
});
