import type {
  FleetReply,
  FleetThreadResult,
} from '@tuturuuu/internal-api/mastermind-threads';
import { describe, expect, it, vi } from 'vitest';
import { createThreadReply, type ReplyTransport } from './thread-reply';

const TARGET = { machineId: 'skr-m4', threadId: 'thread:a' };
const KEYS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];

const receipt = (over: Partial<FleetReply> = {}): FleetReply => ({
  id: KEYS[0]!,
  machineId: 'skr-m4',
  threadId: 'thread:a',
  state: 'sent',
  createdAt: '2026-11-21T05:00:00.000Z',
  ...over,
});
const ok = (reply: FleetReply): FleetThreadResult<FleetReply> => ({
  ok: true,
  data: reply,
});
const refused = (
  error: Extract<FleetThreadResult<FleetReply>, { ok: false }>['error'],
  extra: { maxAgeSeconds?: number } = {}
): FleetThreadResult<FleetReply> => ({
  ok: false,
  error,
  status: 400,
  ...extra,
});

function harness(...answers: FleetThreadResult<FleetReply>[]) {
  const send = vi.fn<ReplyTransport['send']>(
    async () => answers.shift() ?? refused('unavailable')
  );
  const read = vi.fn<ReplyTransport['receipt']>(async () => ok(receipt()));
  let made = 0;
  const reply = createThreadReply(
    TARGET,
    { send, receipt: read },
    () => KEYS[made++]!
  );
  return { reply, send, read };
}

describe('thread reply', () => {
  it('goes from sending to sent to delivered, telling its listeners', async () => {
    const { reply, send, read } = harness(ok(receipt()));
    const phases: string[] = [];
    const stop = reply.subscribe(() => phases.push(reply.getState().phase));
    await reply.submit('  Ship it.  ');
    expect(send).toHaveBeenCalledWith({
      ...TARGET,
      text: 'Ship it.',
      idempotencyKey: KEYS[0],
    });
    expect(reply.getState()).toMatchObject({ phase: 'sent', key: KEYS[0] });

    // A receipt frame about another reply changes nothing and reads nothing.
    await reply.refresh(KEYS[1]);
    expect(read).not.toHaveBeenCalled();
    read.mockResolvedValueOnce(
      ok(receipt({ state: 'delivered', delivery: 'steered' }))
    );
    await reply.refresh(KEYS[0]);
    expect(read).toHaveBeenCalledWith(KEYS[0]);
    const state = reply.getState();
    expect(state.phase === 'delivered' && state.reply.delivery).toBe('steered');
    expect(phases).toEqual(['sending', 'sent', 'delivered']);
    stop();
    reply.reset();
    expect(reply.getState()).toEqual({ phase: 'idle' });
    expect(phases).toHaveLength(3);
  });

  it('settles at once when the machine answered within the wait', async () => {
    const { reply } = harness(
      ok(receipt({ state: 'delivered', delivery: 'started' }))
    );
    expect((await reply.submit('Go')).phase).toBe('delivered');
  });

  it('keeps its key and text through a second-factor step-up', async () => {
    const { reply, send } = harness(
      refused('mfa_required', { maxAgeSeconds: 1800 }),
      ok(receipt())
    );
    expect(await reply.submit('Ship it.')).toEqual({
      phase: 'needs_mfa',
      key: KEYS[0],
      text: 'Ship it.',
      maxAgeSeconds: 1800,
    });
    await reply.retry();
    expect(send.mock.calls.map(([sent]) => sent.idempotencyKey)).toEqual([
      KEYS[0],
      KEYS[0],
    ]);
    expect(send.mock.calls[1]![0].text).toBe('Ship it.');
    expect(reply.getState().phase).toBe('sent');
  });

  it('retries a reply that may still arrive under the same key', async () => {
    for (const error of [
      'machine_offline',
      'timeout',
      'rate_limited',
      'budget_exhausted',
      'outbox_full',
      'stopped',
      'unavailable',
      'invalid_response',
    ] as const) {
      const { reply, send } = harness(refused(error), ok(receipt()));
      expect(await reply.submit('Go')).toMatchObject({
        phase: 'failed',
        error,
        retryable: true,
      });
      await reply.retry();
      expect(send.mock.calls[1]![0].idempotencyKey).toBe(KEYS[0]);
      expect(reply.getState().phase).toBe('sent');
    }
    // The transport itself failing is the same as Web being unreachable.
    const { reply, send } = harness();
    send.mockRejectedValueOnce(new Error('network'));
    expect(await reply.submit('Go')).toMatchObject({
      error: 'unavailable',
      retryable: true,
    });
  });

  it('does not resend what was refused for good; new text is a new reply', async () => {
    for (const error of [
      'forbidden',
      'invalid_reply',
      'idempotency_conflict',
      'unknown_thread',
    ] as const) {
      const { reply, send } = harness(refused(error), ok(receipt()));
      expect(await reply.submit('Go')).toMatchObject({
        phase: 'failed',
        error,
        retryable: false,
      });
      await reply.retry();
      expect(send).toHaveBeenCalledTimes(1);
      await reply.submit('Go again');
      expect(send.mock.calls[1]![0]).toMatchObject({
        text: 'Go again',
        idempotencyKey: KEYS[1],
      });
    }
  });

  it('reports a reply the machine refused or that expired, with its code', async () => {
    const failed = harness(
      ok(receipt({ state: 'failed', code: 'unknown_thread' }))
    );
    expect(await failed.reply.submit('Go')).toEqual({
      phase: 'failed',
      key: KEYS[0],
      text: 'Go',
      error: 'machine_refused',
      code: 'unknown_thread',
      reply: receipt({ state: 'failed', code: 'unknown_thread' }),
      retryable: false,
    });
    const expired = harness(ok(receipt()));
    await expired.reply.submit('Go');
    expired.read.mockResolvedValueOnce(ok(receipt({ state: 'expired' })));
    expect(await expired.reply.refresh()).toMatchObject({
      phase: 'failed',
      error: 'expired',
      retryable: false,
    });
  });

  it('sends one reply at a time and ignores empty text', async () => {
    let release!: (value: FleetThreadResult<FleetReply>) => void;
    const { reply, send, read } = harness();
    send.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    expect((await reply.submit('   ')).phase).toBe('idle');
    const first = reply.submit('One');
    await reply.submit('Two');
    reply.reset();
    expect(reply.getState().phase).toBe('sending');
    release(ok(receipt()));
    await first;
    // Held for the machine: still the same reply.
    await reply.submit('Three');
    expect(send).toHaveBeenCalledTimes(1);
    expect(reply.getState().phase).toBe('sent');
    // A receipt that cannot be read leaves it as it is.
    read.mockRejectedValueOnce(new Error('network'));
    expect((await reply.refresh()).phase).toBe('sent');
    read.mockResolvedValueOnce(refused('unavailable'));
    expect((await reply.refresh()).phase).toBe('sent');
  });

  it('treats the same text sent again as the same reply, under its key', async () => {
    // The composer still holds the text after a step-up or a failure, and the
    // owner presses send instead of retry.
    const stepUp = harness(refused('mfa_required'), ok(receipt()));
    await stepUp.reply.submit('Ship it.');
    await stepUp.reply.submit('  Ship it. ');
    expect(stepUp.send.mock.calls.map(([sent]) => sent.idempotencyKey)).toEqual(
      [KEYS[0], KEYS[0]]
    );
    expect(stepUp.reply.getState().phase).toBe('sent');

    const offline = harness(refused('machine_offline'), ok(receipt()));
    await offline.reply.submit('Ship it.');
    await offline.reply.submit('Ship it.');
    expect(offline.send.mock.calls[1]![0].idempotencyKey).toBe(KEYS[0]);

    // Refused for good: the same text is a new reply, as any text would be.
    const refusedForGood = harness(refused('invalid_reply'), ok(receipt()));
    await refusedForGood.reply.submit('Ship it.');
    await refusedForGood.reply.submit('Ship it.');
    expect(refusedForGood.send.mock.calls[1]![0].idempotencyKey).toBe(KEYS[1]);
  });

  it('reads the receipt of a held reply on retry, when no frame arrives', async () => {
    const { reply, send, read } = harness(ok(receipt()));
    await reply.submit('Go');
    read.mockResolvedValueOnce(
      ok(receipt({ state: 'delivered', delivery: 'queued' }))
    );
    expect((await reply.retry()).phase).toBe('delivered');
    // Asked for the receipt; the text was not sent again.
    expect(read).toHaveBeenCalledWith(KEYS[0]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is not stopped by a listener that throws', async () => {
    const { reply, send } = harness(ok(receipt()));
    const seen: string[] = [];
    reply.subscribe(() => {
      throw new Error('render failed');
    });
    reply.subscribe(() => seen.push(reply.getState().phase));
    expect((await reply.submit('Go')).phase).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['sending', 'sent']);
  });

  it('leaves a held reply in the outbox when the composer is reset', async () => {
    const { reply, send, read } = harness(ok(receipt()), ok(receipt()));
    await reply.submit('First');
    reply.reset();
    expect(reply.getState()).toEqual({ phase: 'idle' });
    // Nothing withdraws it: no call went out, and no receipt is read for it.
    await reply.refresh(KEYS[0]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    // What the owner sends next is another reply.
    await reply.submit('Second');
    expect(send.mock.calls[1]![0]).toMatchObject({
      text: 'Second',
      idempotencyKey: KEYS[1],
    });
  });

  it('comes back from the sign-in holding the waiting reply, and sends it under its key', async () => {
    const send = vi.fn<ReplyTransport['send']>(async () => ok(receipt()));
    const read = vi.fn<ReplyTransport['receipt']>(async () => ok(receipt()));
    const reply = createThreadReply(
      TARGET,
      { send, receipt: read },
      () => KEYS[1]!,
      { key: KEYS[0]!, text: 'Ship it.' }
    );
    expect(reply.getState()).toEqual({
      phase: 'needs_mfa',
      key: KEYS[0],
      text: 'Ship it.',
    });
    await reply.retry();
    expect(send).toHaveBeenCalledWith({
      ...TARGET,
      text: 'Ship it.',
      idempotencyKey: KEYS[0],
    });
    expect(reply.getState().phase).toBe('sent');
  });
});
