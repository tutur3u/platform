// @vitest-environment jsdom
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  MeetCommandExecutor,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
  type MeetRealtimeServerMessage,
  type MeetRoomSnapshot,
} from '@tuturuuu/realtime/meet';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createLiveQaClient,
  type LiveQaChannel,
  type LiveQaCommand,
} from './qa-store';
import { LiveQaClientContext, QaPanel } from './qa-panel';
import { handleLiveQaMessage, liveQaRoom } from './qa-handler';
import { createRoomActions } from '../../../lib/room-actions';
import { MeetSignaling } from '../../../lib/signaling';

vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
afterEach(cleanup);
const now = '2026-11-21T08:00:00Z';
function token(host: boolean) {
  return meetRealtimeTokenPayloadSchema.parse({
    role: host ? 'host' : 'speaker',
    admission: 'open',
    userId: host
      ? '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691'
      : '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2692',
    displayName: host ? 'Host' : 'Participant',
    roomId: 'room',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2000000000,
    limits: {},
    scopes: [],
  });
}

it('two independent clients converge after durable reload, including late join and host moderation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meet-qa-'));
  const path = join(dir, 'snapshot.json');
  const host = token(true);
  const guest = token(false);
  let state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  state = admitOrHold(state, guest, now).state;
  await writeFile(path, JSON.stringify(state));
  const recipients: Array<(message: MeetRealtimeServerMessage) => void> = [];
  async function run(message: LiveQaCommand, actor = guest) {
    // A fresh executor and deserialized state for every command model eviction.
    const restored: MeetRoomSnapshot = JSON.parse(await readFile(path, 'utf8'));
    const replies: MeetRealtimeServerMessage[] = [];
    await new MeetCommandExecutor().run(
      { message, token: actor, now },
      {
        read: () => restored,
        runSfu: async () => {
          throw new Error('unexpected SFU call');
        },
        commit: async (result) => {
          await writeFile(path, JSON.stringify(result.state));
          replies.push(...result.reply);
          for (const entry of result.broadcast)
            for (const receive of recipients) receive(structuredClone(entry));
        },
      }
    );
    return replies;
  }
  const pending: Promise<unknown>[] = [];
  function channel(): LiveQaChannel {
    return {
      send: (message) => {
        pending.push(
          run(message).then((replies) => {
            for (const reply of replies)
              for (const receive of recipients) receive(structuredClone(reply));
          })
        );
      },
      subscribe: (listener) => {
        recipients.push(listener);
        return () => {
          recipients.splice(recipients.indexOf(listener), 1);
        };
      },
    };
  }
  const a = createLiveQaClient(channel());
  const b = createLiveQaClient(channel());
  const stopA = a.subscribe(() => {});
  await Promise.all(pending.splice(0));
  const stopB = b.subscribe(() => {});
  await Promise.all(pending.splice(0));
  try {
    await run({ type: 'qa.ask', text: 'What is next?' });
    expect(a.read()).toEqual(b.read());
    expect(a.read()).not.toBe(b.read());
    const id = a.read().questions[0]!.id;
    await run({ type: 'qa.upvote', questionId: id, upvoted: true });
    await run({ type: 'qa.upvote', questionId: id, upvoted: true });
    expect(a.read().questions[0]!.upvotes).toEqual([guest.userId]);
    for (const field of ['hidden', 'answered'] as const) {
      const denied = await run({
        type: 'qa.moderate',
        questionId: id,
        field,
        value: true,
      });
      expect(denied).toContainEqual(
        expect.objectContaining({ type: 'error', error: 'permission_denied' })
      );
      expect(a.read().questions[0]![field]).toBe(false);
      await run(
        { type: 'qa.moderate', questionId: id, field, value: true },
        host
      );
    }
    await run({ type: 'qa.clear' });
    expect(a.read().questions[0]).toMatchObject({
      hidden: true,
      answered: true,
    });
    const lateClient = createLiveQaClient(channel());
    const stopLate = lateClient.subscribe(() => {});
    await Promise.all(pending.splice(0));
    expect(lateClient.read()).toEqual(a.read());
    stopLate();
    const late = await run({ type: 'qa.read' });
    expect(late).toContainEqual(
      expect.objectContaining({ snapshot: a.read() })
    );
    await run({ type: 'qa.clear' }, host);
    expect(a.read()).toEqual(b.read());
    expect(b.read().questions[0]).toMatchObject({
      hidden: false,
      answered: false,
    });
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'qa.ask',
        text: 'x'.repeat(401),
      }).success
    ).toBe(false);
    expect(await run({ type: 'qa.ask', text: 'x'.repeat(401) })).toContainEqual(
      expect.objectContaining({ error: 'qa_invalid_length' })
    );
    for (let i = 0; i < 20; i++)
      await run({ type: 'qa.upvote', questionId: id, upvoted: true });
    expect(await run({ type: 'qa.ask', text: 'Limited' })).toContainEqual(
      expect.objectContaining({ error: 'qa_rate_limited' })
    );
    expect(a.read().questions).toHaveLength(1);
  } finally {
    stopA();
    stopB();
    await rm(dir, { recursive: true });
  }
});

it('sends participant questions through the channel and renders only server state', () => {
  const send = vi.fn();
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send,
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  const props = {
    role: 'participant',
    participantId: token(false).userId,
  } as const;
  render(
    <LiveQaClientContext value={client}>
      <QaPanel {...props} />
    </LiveQaClientContext>
  );
  fireEvent.change(screen.getByLabelText('Question'), {
    target: { value: 'A question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(send).toHaveBeenCalledWith({ type: 'qa.ask', text: 'A question' });
  expect(client.read().questions).toHaveLength(0);
  receive({ type: 'qa.snapshot', snapshot: { questions: [] } });
  expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
});

it('routes panel commands and reconnect snapshots through the existing signaling instance', () => {
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
  expect(send).toHaveBeenCalledWith({ type: 'qa.ask', text: 'Shared socket' });
  handleLiveQaMessage(
    meetingId,
    {
      type: 'qa.snapshot',
      snapshot: {
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
      },
    },
    actions.sendLiveQa
  );
  expect(client.read().questions[0]?.text).toBe('Shared socket');
  stop();
  handleLiveQaMessage(meetingId, { type: 'room.ended' }, actions.sendLiveQa);
});
