// Qualification scenarios that hold against any environment: real users,
// the Web API's ticket and publish paths, and the deployed Worker.
import { check } from './env.mjs';
import { eventOf, openRoom, realtimeOrigin, refused } from './rooms.mjs';

const isIdOnly = (record) =>
  record && typeof record === 'object' && Object.keys(record).join() === 'id';

export async function runSharedScenarios(context) {
  const { config, report, sessions, web } = context;
  const { a, b, outsider } = sessions;
  const wsId = config.workspaceId;
  const state = {};

  await report.step(
    'ticket requires a session and workspace access',
    async () => {
      check(
        (await web.ticket(null, wsId)).status === 401,
        'anonymous ticket allowed'
      );
      const denied = await web.ticket(outsider, wsId);
      check(
        [401, 403, 404].includes(denied.status),
        `outsider ticket returned ${denied.status}`
      );
    }
  );

  await report.step(
    'worker is healthy and accepts web-issued inbox tickets',
    async () => {
      const ticket = await web.ticketJson(a, wsId);
      check(ticket.enabled === true, 'Web API reports realtime disabled');
      check(
        ticket.url.startsWith('wss:') || config.local,
        'ticket URL is not wss'
      );
      state.origin = realtimeOrigin(ticket);
      const health = await (await fetch(`${state.origin}/health`)).json();
      check(
        health.ok === true && health.stopped === false,
        'worker health is not ok'
      );
      state.inboxA = await openRoom(ticket);
      state.inboxB = await openRoom(await web.ticketJson(b, wsId));
      if (config.secondWorkspaceId) {
        state.otherInboxA = await openRoom(
          await web.ticketJson(a, config.secondWorkspaceId)
        );
      }
    }
  );

  await report.step(
    'conversation creation reaches member inboxes as IDs only',
    async () => {
      state.conversation = await web.createGroup(a, wsId, [b.userId]);
      const id = state.conversation.id;
      for (const inbox of [state.inboxA, state.inboxB]) {
        const frame = await inbox.waitFor(
          eventOf(
            'conversation.created',
            (event) =>
              event.conversationId === id || event.conversation?.id === id
          ),
          'conversation.created on inbox'
        );
        check(
          isIdOnly(frame.event.conversation),
          'inbox frame carries conversation fields'
        );
      }
    }
  );

  await report.step(
    'conversation tickets are limited to participants',
    async () => {
      const id = state.conversation.id;
      const denied = await web.ticket(outsider, wsId, id);
      check(
        [401, 403, 404].includes(denied.status),
        `outsider conversation ticket returned ${denied.status}`
      );
      state.ticketB = await web.ticketJson(b, wsId, id);
      state.roomA = await openRoom(await web.ticketJson(a, wsId, id));
      state.roomB = await openRoom(state.ticketB);
    }
  );

  await report.step(
    'a sent message fans out with full DTO in the room and IDs in inboxes',
    async () => {
      const id = state.conversation.id;
      const marker = `qualify ${crypto.randomUUID()}`;
      const message = await web.send(a, wsId, id, marker);
      const frame = await state.roomB.waitFor(
        eventOf('message.created', (event) => event.message?.id === message.id),
        'message.created in room'
      );
      check(
        frame.event.message.content === marker,
        'room frame lacks the message content'
      );
      check(
        typeof frame.seq === 'number',
        'room frame lacks a sequence number'
      );
      const inboxFrame = await state.inboxB.waitFor(
        eventOf('message.created', (event) => event.message?.id === message.id),
        'message.created on inbox'
      );
      check(
        isIdOnly(inboxFrame.event.message),
        'inbox frame carries message content'
      );
      if (state.otherInboxA) {
        await state.otherInboxA.expectNone(
          (f) => f.t === 'event',
          'another workspace inbox received the event'
        );
      }
    }
  );

  await report.step(
    'typing reaches the other participant only through the room',
    async () => {
      state.roomB.send({ on: true, t: 'typing' });
      await state.roomA.waitFor(
        (f) => f.t === 'typing' && f.on === true && f.userId === b.userId,
        'typing frame'
      );
    }
  );

  await report.step(
    'a reconnect replays the gap after its cursor',
    async () => {
      const id = state.conversation.id;
      const since = state.roomB.lastSeq();
      await state.roomB.close();
      const first = await web.send(
        a,
        wsId,
        id,
        `qualify ${crypto.randomUUID()}`
      );
      const second = await web.send(
        a,
        wsId,
        id,
        `qualify ${crypto.randomUUID()}`
      );
      state.roomB = await openRoom(await web.ticketJson(b, wsId, id), {
        since,
      });
      const replayed = state.roomB.frames.filter(
        (f) => f.t === 'event' && f.event?.type === 'message.created'
      );
      await state.roomB.waitFor(
        eventOf('message.created', (event) => event.message?.id === second.id),
        'replayed message'
      );
      const order = state.roomB.frames
        .filter(
          (f) =>
            f.t === 'event' &&
            [first.id, second.id].includes(f.event?.message?.id)
        )
        .map((f) => f.event.message.id);
      check(
        order.join() === [first.id, second.id].join(),
        `replay order ${order.length}/${replayed.length}`
      );
      check(
        state.roomB.frames.every((f) => f.t !== 'resync'),
        'room asked for resync inside its window'
      );
    }
  );

  await report.step(
    'leaving closes the member socket and fences its tickets',
    async () => {
      const id = state.conversation.id;
      const staleTicket = await web.ticketJson(b, wsId, id);
      await web.leave(b, wsId, id);
      const closed = await Promise.race([
        state.roomB.closed,
        new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      check(
        closed?.code === 4003,
        `member socket close code ${closed?.code ?? 'none'}`
      );
      check(
        await refused(staleTicket),
        'a ticket issued before leaving reconnected'
      );
      const after = await web.ticket(b, wsId, id);
      check(
        [403, 404].includes(after.status),
        `ticket after leaving returned ${after.status}`
      );
    }
  );

  await report.step(
    'messages stay readable through the REST fallback',
    async () => {
      const id = state.conversation.id;
      const message = await web.send(
        a,
        wsId,
        id,
        `qualify ${crypto.randomUUID()}`
      );
      const messages = await web.messages(a, wsId, id);
      check(
        messages.some((m) => m.id === message.id),
        'REST list misses the sent message'
      );
    }
  );

  for (const room of [
    state.inboxA,
    state.inboxB,
    state.otherInboxA,
    state.roomA,
    state.roomB,
  ]) {
    room?.close();
  }
  await web.leave(a, wsId, state.conversation.id).catch(() => undefined);
  return state;
}

/**
 * Checks for an environment whose Worker stop fence is set: the Web API keeps
 * accepting messages, sockets are refused, and REST reads still work.
 */
export async function runStoppedScenarios(context) {
  const { config, report, sessions, web } = context;
  const wsId = config.workspaceId;
  await report.step(
    'stopped worker refuses sockets and web keeps persisting',
    async () => {
      const ticket = await web.ticketJson(sessions.a, wsId);
      check(ticket.enabled === true, 'Web API reports realtime disabled');
      const health = await (
        await fetch(`${realtimeOrigin(ticket)}/health`)
      ).json();
      check(health.stopped === true, 'worker health does not report stopped');
      check(await refused(ticket), 'stopped worker accepted a socket');
      const conversation = await web.createGroup(sessions.a, wsId, [
        sessions.b.userId,
      ]);
      const message = await web.send(
        sessions.a,
        wsId,
        conversation.id,
        `qualify ${crypto.randomUUID()}`
      );
      const messages = await web.messages(sessions.b, wsId, conversation.id);
      check(
        messages.some((m) => m.id === message.id),
        'REST list misses the sent message'
      );
      await web.leave(sessions.b, wsId, conversation.id);
      await web.leave(sessions.a, wsId, conversation.id);
    }
  );
}

/** Checks for an environment whose Web API has no Worker origin set. */
export async function runDisabledScenarios(context) {
  const { config, report, sessions, web } = context;
  await report.step(
    'web without a worker origin returns polling mode',
    async () => {
      const ticket = await web.ticketJson(sessions.a, config.workspaceId);
      check(ticket.enabled === false, 'Web API still issues tickets');
    }
  );
}
