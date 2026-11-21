import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { FleetWrite } from '../native/clients';
import type { FleetAnswerReceipt, FleetAnswerRequest } from './contract';
import { type FleetLoad, fleetPageState } from './page-state';
import { answerFleetDecision } from './server';

/** How long a tapped answer waits so Undo can still cancel it. */
export const UNDO_WINDOW_MS = 5_000;

export type AnswerInput = Omit<FleetAnswerRequest, 'decisionId'>;

/**
 * An answer is sent once. A send whose outcome is unknown is never repeated
 * automatically: the owner checks the snapshot, and choosing again records a
 * new, deliberate revision.
 */
export type AnswerState =
  | { kind: 'idle' }
  | { kind: 'replying'; draft: string }
  | { kind: 'pending'; input: AnswerInput; sendsAt: number }
  | { kind: 'sending'; input: AnswerInput }
  | { kind: 'sent'; receipt: FleetAnswerReceipt }
  | { kind: 'closed' }
  /** Another device answered while this one waited; it was not sent. */
  | { kind: 'superseded'; receipt: FleetAnswerReceipt }
  /** `maybeSent`: the request may have reached Web; false when it never left. */
  | { kind: 'error'; maybeSent: boolean };

export type AnswerEvent =
  | { type: 'reply' }
  | { type: 'draft'; draft: string }
  | { type: 'cancel' }
  | { type: 'queue'; input: AnswerInput; now: number; delay?: number }
  | { type: 'undo' }
  | { type: 'send' }
  /** The page turned read-only before a pending answer left. */
  | { type: 'block' }
  /** A newer answer appeared in the snapshot before this one left. */
  | { type: 'supersede'; receipt: FleetAnswerReceipt }
  | { type: 'result'; result: FleetWrite }
  /** A fresh snapshot after an error: recorded, closed, or not recorded. */
  | { type: 'checked'; receipt?: FleetAnswerReceipt; open: boolean };

/** Admits each event only in the states where it means something. */
export function answerReducer(
  state: AnswerState,
  event: AnswerEvent
): AnswerState {
  switch (event.type) {
    case 'reply':
      return state.kind === 'idle' ? { kind: 'replying', draft: '' } : state;
    case 'draft':
      return state.kind === 'replying'
        ? { kind: 'replying', draft: event.draft }
        : state;
    case 'cancel':
      return state.kind === 'replying' ? { kind: 'idle' } : state;
    case 'queue':
      return state.kind === 'idle' || state.kind === 'replying'
        ? {
            kind: 'pending',
            input: event.input,
            sendsAt: event.now + (event.delay ?? UNDO_WINDOW_MS),
          }
        : state;
    case 'undo':
      return state.kind === 'pending' ? { kind: 'idle' } : state;
    case 'send':
      return state.kind === 'pending'
        ? { kind: 'sending', input: state.input }
        : state;
    case 'block':
      return state.kind === 'pending'
        ? { kind: 'error', maybeSent: false }
        : state;
    case 'supersede':
      return state.kind === 'pending'
        ? { kind: 'superseded', receipt: event.receipt }
        : state;
    case 'result': {
      if (state.kind !== 'sending') return state;
      const { result } = event;
      if (result.kind === 'sent')
        return { kind: 'sent', receipt: result.receipt };
      if (result.kind === 'closed') return { kind: 'closed' };
      return { kind: 'error', maybeSent: true };
    }
    case 'checked':
      if (state.kind !== 'error') return state;
      if (event.receipt) return { kind: 'sent', receipt: event.receipt };
      return event.open ? { kind: 'idle' } : { kind: 'closed' };
  }
}

/**
 * One decision's answer flow: queue (with an Undo window, or none for "I
 * signed in"), send once with its own idempotency key while the page is
 * live, then refresh the snapshot so the receipt and pickup show.
 */
export function useAnswer(decisionId: string) {
  const [state, dispatch] = useReducer(answerReducer, { kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryClient = useQueryClient();
  // A decision that leaves the snapshot takes its card, and any pending send, with it.
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = useCallback(
    async (input: AnswerInput) => {
      // Readiness is recomputed from the cached snapshot at the moment of
      // sending, not taken from the last render.
      const load = queryClient.getQueryData<FleetLoad>(['fleet']);
      if (!load || fleetPageState(load, Date.now()).kind !== 'ready')
        return dispatch({ type: 'block' });
      const current =
        load?.read.kind === 'ready'
          ? load.read.snapshot.answers[decisionId]
          : undefined;
      if (current) return dispatch({ type: 'supersede', receipt: current });
      dispatch({ type: 'send' });
      let result: FleetWrite;
      try {
        result = await answerFleetDecision({ data: { ...input, decisionId } });
      } catch {
        result = { kind: 'error', reason: 'unavailable' };
      }
      dispatch({ type: 'result', result });
      if (result.kind !== 'error')
        await queryClient.invalidateQueries({ queryKey: ['fleet'] });
    },
    [decisionId, queryClient]
  );

  const queue = useCallback(
    (
      choice: Omit<AnswerInput, 'idempotencyKey'>,
      options: { delay?: number } = {}
    ) => {
      clearTimeout(timer.current);
      const input = { ...choice, idempotencyKey: crypto.randomUUID() };
      const delay = options.delay ?? UNDO_WINDOW_MS;
      dispatch({ type: 'queue', input, now: Date.now(), delay });
      timer.current = setTimeout(() => void send(input), delay);
    },
    [send]
  );

  return {
    state,
    reply: () => dispatch({ type: 'reply' }),
    draft: (draft: string) => dispatch({ type: 'draft', draft }),
    cancel: () => dispatch({ type: 'cancel' }),
    undo: () => {
      clearTimeout(timer.current);
      dispatch({ type: 'undo' });
    },
    queue,
    /**
     * Reads a fresh snapshot after an error. Only a successful new read
     * counts; a failed or cached one leaves the error in place.
     */
    check: async () => {
      if (state.kind !== 'error') return;
      const before = queryClient.getQueryData<FleetLoad>(['fleet'])?.fetchedAt;
      await queryClient.refetchQueries({ queryKey: ['fleet'] });
      const load = queryClient.getQueryData<FleetLoad>(['fleet']);
      if (
        !load ||
        load.fetchedAt === before ||
        load.refreshError ||
        load.read.kind !== 'ready'
      )
        return;
      const { snapshot } = load.read;
      dispatch({
        type: 'checked',
        receipt: snapshot.answers[decisionId],
        open: snapshot.state.decisions.some((d) => d.id === decisionId),
      });
    },
  };
}
