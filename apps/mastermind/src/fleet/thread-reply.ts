/**
 * One owner reply into a fleet thread, from typing to the machine's receipt.
 * A reply gets its idempotency key once and keeps it through every retry, a
 * second-factor step-up included, so it reaches the thread once however
 * often it is sent. The transport is injected: a server function that calls
 * `sendFleetThreadReply` / `getFleetThreadReply` with the owner's bearer.
 */
import type {
  FleetReply,
  FleetThreadFailure,
  FleetThreadResult,
} from '@tuturuuu/internal-api/mastermind-threads';

export type ReplyTarget = {
  machineId: string;
  environmentId?: string;
  threadId: string;
};

export type ReplyState =
  | { phase: 'idle' }
  | { phase: 'sending'; key: string; text: string }
  /** Web holds it for the machine; the receipt follows over the owner socket. */
  | { phase: 'sent'; key: string; text: string; reply: FleetReply }
  /** In the thread. `reply.delivery` says steered, started or queued. */
  | { phase: 'delivered'; key: string; text: string; reply: FleetReply }
  /**
   * The session's second-factor proof is too old for a reply: verify again,
   * then `retry()`. The text and key are kept.
   */
  | { phase: 'needs_mfa'; key: string; text: string; maxAgeSeconds?: number }
  | {
      phase: 'failed';
      key: string;
      text: string;
      /** A closed code: a refusal, or the machine's own failure code. */
      error: FleetThreadFailure | 'expired' | 'machine_refused';
      code?: string;
      /** The machine's receipt, when it was the machine that refused. */
      reply?: FleetReply;
      /** `retry()` can still deliver this very reply. */
      retryable: boolean;
    };

export type ReplyTransport = {
  send(
    reply: ReplyTarget & { text: string; idempotencyKey: string }
  ): Promise<FleetThreadResult<FleetReply>>;
  receipt(id: string): Promise<FleetThreadResult<FleetReply>>;
};

const RETRYABLE: ReadonlySet<FleetThreadFailure> = new Set([
  'machine_offline',
  'timeout',
  'rate_limited',
  'budget_exhausted',
  'outbox_full',
  'stopped',
  'unavailable',
  'invalid_response',
]);

/** The state a receipt puts the reply in. */
function settle(key: string, text: string, reply: FleetReply): ReplyState {
  if (reply.state === 'sent') return { phase: 'sent', key, text, reply };
  if (reply.state === 'delivered')
    return { phase: 'delivered', key, text, reply };
  // The machine refused it, or it outlived its day in the outbox. Either way
  // this key is spent: sending the text again is a new reply.
  return {
    phase: 'failed',
    key,
    text,
    error: reply.state === 'expired' ? 'expired' : 'machine_refused',
    ...(reply.code ? { code: reply.code } : {}),
    reply,
    retryable: false,
  };
}

export function createThreadReply(
  target: ReplyTarget,
  transport: ReplyTransport,
  newKey: () => string = () => crypto.randomUUID()
) {
  let state: ReplyState = { phase: 'idle' };
  const listeners = new Set<() => void>();
  const set = (next: ReplyState) => {
    state = next;
    for (const listener of listeners)
      try {
        listener();
      } catch {
        // A listener that fails must not stop the reply it is told about.
      }
  };
  /** The reply can be sent again as it is, under its key. */
  const resendable = () =>
    state.phase === 'needs_mfa' ||
    (state.phase === 'failed' && state.retryable);

  async function deliver(key: string, text: string) {
    set({ phase: 'sending', key, text });
    const result = await transport
      .send({ ...target, text, idempotencyKey: key })
      .catch((): FleetThreadResult<FleetReply> => ({
        ok: false,
        error: 'unavailable',
        status: 0,
      }));
    // A newer reply took over while this one was in flight.
    if (state.phase !== 'sending' || state.key !== key) return state;
    if (result.ok) set(settle(key, text, result.data));
    else if (result.error === 'mfa_required')
      set({
        phase: 'needs_mfa',
        key,
        text,
        ...(result.maxAgeSeconds === undefined
          ? {}
          : { maxAgeSeconds: result.maxAgeSeconds }),
      });
    else
      set({
        phase: 'failed',
        key,
        text,
        error: result.error,
        retryable: RETRYABLE.has(result.error),
      });
    return state;
  }

  /**
   * Reads the receipt again. Call it when the owner socket delivers a
   * `receipt` frame; `replyId` skips frames about other replies.
   */
  async function refresh(replyId?: string) {
    if (state.phase !== 'sent' || (replyId && replyId !== state.key))
      return state;
    const { key, text } = state;
    const result = await transport.receipt(key).catch(() => null);
    if (result?.ok && state.phase === 'sent' && state.key === key)
      set(settle(key, text, result.data));
    return state;
  }

  /**
   * Sends the same reply again, under the same key. While the reply is held
   * for the machine, reads its receipt instead: the way forward when no
   * receipt frame arrives.
   */
  function retry() {
    if (state.phase === 'sent') return refresh();
    if (
      state.phase === 'needs_mfa' ||
      (state.phase === 'failed' && state.retryable)
    )
      return deliver(state.key, state.text);
    return Promise.resolve(state);
  }

  return {
    /** For `useSyncExternalStore`. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getState: () => state,

    /**
     * Sends new text as a new reply. Ignored while one is being sent, or held
     * for the machine: that reply is still on its way. The same text again,
     * while its reply can still be resent, is that reply again, under its key.
     */
    submit(text: string) {
      const trimmed = text.trim();
      if (!trimmed || state.phase === 'sending' || state.phase === 'sent')
        return Promise.resolve(state);
      if (resendable() && 'text' in state && state.text === trimmed)
        return retry();
      return deliver(newKey(), trimmed);
    },
    retry,
    refresh,

    /**
     * Back to an empty composer. A reply still held for the machine stays in
     * its outbox and is delivered when the machine takes it.
     */
    reset() {
      if (state.phase !== 'sending') set({ phase: 'idle' });
    },
  };
}

export type ThreadReply = ReturnType<typeof createThreadReply>;
