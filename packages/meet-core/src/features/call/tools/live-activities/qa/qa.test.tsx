// @vitest-environment jsdom
import {
  admitOrHold,
  createMeetRoomSnapshot,
  MeetCommandExecutor,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeServerMessage,
  type MeetRealtimeTokenPayload,
  type MeetRoomSnapshot,
} from '@tuturuuu/realtime/meet';
import { expect, it, vi } from 'vitest';
import { createRoomActions } from '../../../lib/room-actions';
import { MeetSignaling } from '../../../lib/signaling';
import { handleLiveQaMessage, liveQaRoom } from './qa-handler';
import { sortLiveQa, upvotedByMe } from './qa-sort';
import {
  createLiveQaClient,
  type LiveQaChannel,
  type LiveQaCommand,
  type LiveQaQuestion,
} from './qa-store';

const now = '2026-11-23T08:00:00Z';
function token(
  role: 'host' | 'speaker',
  extra: Partial<MeetRealtimeTokenPayload> = {}
) {
  return meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: 'open',
    userId: crypto.randomUUID(),
    displayName: role === 'host' ? 'Host' : 'Participant',
    roomId: 'room',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2000000000,
    limits: {},
    scopes: [],
    ...extra,
  });
}

/**
 * A room run through the real executor with a JSON round trip for every
 * command, and clients that receive what their connection would: their own
 * replies, the broadcast, and messages sent directly to them.
 */
function harness(tokens: MeetRealtimeTokenPayload[]) {
  let state: MeetRoomSnapshot = createMeetRoomSnapshot();
  for (const entry of tokens) state = admitOrHold(state, entry, now).state;
  const connections: Array<{
    token: MeetRealtimeTokenPayload;
    receive: (message: MeetRealtimeServerMessage) => void;
  }> = [];
  const pending: Promise<unknown>[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  // The room handles one message at a time, in the order they arrive.
  function run(message: LiveQaCommand, actor: MeetRealtimeTokenPayload) {
    const next = queue.then(() => execute(message, actor));
    queue = next;
    return next;
  }
  async function execute(
    message: LiveQaCommand,
    actor: MeetRealtimeTokenPayload
  ) {
    const restored: MeetRoomSnapshot = JSON.parse(JSON.stringify(state));
    const replies: MeetRealtimeServerMessage[] = [];
    await new MeetCommandExecutor().run(
      { message, token: actor, now },
      {
        read: () => restored,
        runSfu: async () => {
          throw new Error('unexpected SFU call');
        },
        commit: async (result) => {
          state = JSON.parse(JSON.stringify(result.state));
          replies.push(...result.reply);
          for (const connection of connections) {
            for (const entry of result.broadcast)
              connection.receive(structuredClone(entry));
            for (const entry of result.direct)
              if (entry.userId === connection.token.userId)
                connection.receive(structuredClone(entry.message));
          }
        },
      }
    );
    return replies;
  }
  function connect(actor: MeetRealtimeTokenPayload) {
    const channel: LiveQaChannel = {
      send: (message) => {
        pending.push(
          run(message, actor).then((replies) => {
            for (const connection of connections)
              if (connection.token === actor)
                for (const reply of replies) connection.receive(reply);
          })
        );
      },
      subscribe: (listener) => {
        const connection = { token: actor, receive: listener };
        connections.push(connection);
        return () => {
          connections.splice(connections.indexOf(connection), 1);
        };
      },
    };
    const client = createLiveQaClient(channel);
    client.subscribe(() => {});
    return client;
  }
  return {
    connect,
    run,
    settle: () => Promise.all(pending.splice(0)),
    state: () => state,
  };
}

it('shows each person their own vote, for guests and signed-in members alike', async () => {
  const host = token('host', { accountId: crypto.randomUUID() });
  const member = token('speaker', { accountId: crypto.randomUUID() });
  // A guest has no account, so the room keys its votes by its room id.
  const guest = token('speaker', { displayName: 'Guest' });
  const room = harness([host, member, guest]);
  const hostClient = room.connect(host);
  const memberClient = room.connect(member);
  const guestClient = room.connect(guest);
  await room.settle();
  expect(guestClient.read().self).toEqual({
    actor: guest.userId,
    participantId: guest.userId,
    votedIds: [],
  });
  expect(memberClient.read().self?.actor).toBe(member.accountId);
  memberClient.send({ type: 'qa.ask', text: 'What is next?' });
  await room.settle();
  const question = () => guestClient.read().snapshot.questions[0]!;
  guestClient.send({
    type: 'qa.upvote',
    questionId: question().id,
    upvoted: true,
  });
  await room.settle();
  expect(upvotedByMe(question(), guestClient.read().self)).toBe(true);
  expect(
    upvotedByMe(
      memberClient.read().snapshot.questions[0]!,
      memberClient.read().self
    )
  ).toBe(false);
  memberClient.send({
    type: 'qa.upvote',
    questionId: question().id,
    upvoted: true,
  });
  await room.settle();
  expect(
    upvotedByMe(
      memberClient.read().snapshot.questions[0]!,
      memberClient.read().self
    )
  ).toBe(true);
  // The room sees a count, never who voted.
  expect(question().upvoteCount).toBe(2);
  expect(question().upvotes).toEqual([]);
  expect(hostClient.read().snapshot.questions[0]?.upvotes).toHaveLength(2);
  expect(question().authorName).toBe('Participant');
  expect(hostClient.read().isHost).toBe(true);
  expect(guestClient.read().isHost).toBe(false);
});

it('keeps hidden questions with hosts, converges answers and serves late joiners', async () => {
  const host = token('host');
  const guest = token('speaker');
  const room = harness([host, guest]);
  const hostClient = room.connect(host);
  const guestClient = room.connect(guest);
  await room.settle();
  guestClient.send({ type: 'qa.ask', text: 'Keep?' });
  guestClient.send({ type: 'qa.ask', text: 'Remove?' });
  await room.settle();
  const [keep, remove] = guestClient.read().snapshot.questions;
  hostClient.send({
    type: 'qa.moderate',
    questionId: remove!.id,
    field: 'hidden',
    value: true,
  });
  guestClient.send({ type: 'qa.answer', questionId: keep!.id, text: 'Yes' });
  await room.settle();
  expect(guestClient.read().snapshot.questions.map((q) => q.text)).toEqual([
    'Keep?',
  ]);
  expect(hostClient.read().snapshot.questions).toHaveLength(2);
  expect(hostClient.read().snapshot.questions[0]?.answers).toMatchObject([
    { text: 'Yes', byHost: false },
  ]);
  // A guest's host-only command is refused and shown to that guest only.
  guestClient.send({ type: 'qa.pin', questionId: keep!.id, pinned: true });
  await room.settle();
  expect(guestClient.read().error).toBe('permission_denied');
  expect(hostClient.read().error).toBe(null);
  const late = room.connect(guest);
  await room.settle();
  expect(late.read().snapshot).toEqual(guestClient.read().snapshot);
});

it('forgets the host view and older snapshots when the person is admitted again', () => {
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send: () => {},
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  client.subscribe(() => {});
  receive({ type: 'qa.snapshot', snapshot: { questions: [], revision: 5 } });
  receive({ type: 'qa.host', snapshot: { questions: [], revision: 5 } });
  // A held broadcast older than the latest reply is ignored.
  receive({ type: 'qa.snapshot', snapshot: { questions: [], revision: 4 } });
  expect(client.read().snapshot.revision).toBe(5);
  expect(client.read().isHost).toBe(true);
  client.reset();
  expect(client.read().isHost).toBe(false);
  receive({ type: 'qa.snapshot', snapshot: { questions: [], revision: 1 } });
  expect(client.read().snapshot.revision).toBe(1);
});

it('resolves a request when the room answers it', async () => {
  const sent: LiveQaCommand[] = [];
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient(
    {
      send: (message) => sent.push(message),
      subscribe: (listener) => {
        receive = listener;
        return () => {};
      },
    },
    { requestTimeoutMs: 50 }
  );
  client.subscribe(() => {});
  const applied = client.request({ type: 'qa.clear' });
  receive({
    type: 'qa.snapshot',
    snapshot: { questions: [] },
    requestId: sent.at(-1)?.requestId,
  });
  expect(await applied).toBe(null);
  const refused = client.request({ type: 'qa.clear' });
  receive({
    type: 'error',
    error: 'permission_denied',
    requestId: sent.at(-1)?.requestId,
  });
  expect(await refused).toBe('permission_denied');
  expect(await client.request({ type: 'qa.clear' })).toBe('qa_timeout');
});

it('drops a host view once the shared view is newer', () => {
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send: () => {},
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  client.subscribe(() => {});
  receive({ type: 'qa.host', snapshot: { questions: [], revision: 3 } });
  receive({ type: 'qa.snapshot', snapshot: { questions: [], revision: 3 } });
  expect(client.read().isHost).toBe(true);
  receive({ type: 'qa.snapshot', snapshot: { questions: [], revision: 4 } });
  expect(client.read().isHost).toBe(false);
});

it('sorts by votes, by time and by answered, with the pinned question first', () => {
  const question = (
    id: string,
    votes: number,
    minute: number,
    extra: Partial<LiveQaQuestion> = {}
  ): LiveQaQuestion => ({
    id,
    participantId: 'p',
    text: id,
    upvotes: Array.from({ length: votes }, (_, index) => `v${index}`),
    answered: false,
    hidden: false,
    createdAt: `2026-11-23T08:0${minute}:00Z`,
    ...extra,
  });
  const questions = [
    question('old-popular', 5, 1),
    question('new-quiet', 0, 4),
    question('tied-newer', 2, 3),
    question('tied-older', 2, 2),
    question('pinned', 0, 0, { pinned: true }),
    question('done', 9, 5, { answered: true }),
    question('hidden', 9, 6, { hidden: true }),
  ];
  const ids = (sort: Parameters<typeof sortLiveQa>[1]) =>
    sortLiveQa(questions, sort).map((q) => q.id);
  expect(ids('top')).toEqual([
    'pinned',
    'old-popular',
    'tied-newer',
    'tied-older',
    'new-quiet',
  ]);
  expect(ids('newest')).toEqual([
    'pinned',
    'new-quiet',
    'tied-newer',
    'tied-older',
    'old-popular',
  ]);
  expect(ids('answered')).toEqual(['done']);
  expect(
    sortLiveQa(questions, 'top', { includeHidden: true }).map((q) => q.id)
  ).toContain('hidden');
});

it('routes Q&A frames and its own refusals through the existing signaling instance', () => {
  const signaling = new MeetSignaling({
    onMessage: () => {},
    resolveUrl: () => '',
  });
  const send = vi.spyOn(signaling, 'send').mockImplementation(() => {});
  const actions = createRoomActions({ current: signaling });
  const meetingId = 'qa-existing-socket';
  const client = liveQaRoom(meetingId).client;
  const stop = client.subscribe(() => {});
  handleLiveQaMessage(
    meetingId,
    { type: 'admission.result', admitted: true, decidedBy: 'host' },
    actions.sendLiveQa
  );
  expect(send).toHaveBeenCalledWith({ type: 'qa.read' });
  client.send({ type: 'qa.ask', text: 'Shared socket' });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'qa.ask', text: 'Shared socket' })
  );
  const snapshot = {
    questions: [
      {
        id: 'question',
        participantId: 'guest',
        text: 'Shared socket',
        upvotes: [],
        hidden: false,
        answered: false,
      },
    ],
  };
  handleLiveQaMessage(
    meetingId,
    { type: 'qa.snapshot', snapshot },
    actions.sendLiveQa
  );
  expect(client.read().snapshot.questions[0]?.text).toBe('Shared socket');
  handleLiveQaMessage(
    meetingId,
    { type: 'error', error: 'chat_rate_limited', requestId: 'chat:1' },
    actions.sendLiveQa
  );
  expect(client.read().error).toBe(null);
  handleLiveQaMessage(
    meetingId,
    { type: 'error', error: 'qa_rate_limited', requestId: 'qa:9' },
    actions.sendLiveQa
  );
  expect(client.read().error).toBe('qa_rate_limited');
  stop();
  handleLiveQaMessage(meetingId, { type: 'room.ended' }, actions.sendLiveQa);
});
