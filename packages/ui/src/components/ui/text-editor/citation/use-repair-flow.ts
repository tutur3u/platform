'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useCitationContext } from './citation-context';
import {
  type CitationRepairFailure,
  classifyRepairFailure,
} from './label-keys';
import type { CitationRepair, CitationResult } from './types';

export type RepairPhase =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'failed'; failure: CitationRepairFailure }
  | { kind: 'stale' };

export type RepairView =
  | RepairPhase
  | { kind: 'pending' }
  | { kind: 'review'; proposal: CitationRepair };

interface Options {
  /** Identity of the exact input (snapshot or raw text) being repaired. */
  sessionKey: string;
  createOperationId: () => string;
  run: (operationId: string) => Promise<CitationResult<CitationRepair>>;
}

/**
 * One bounded, billed repair per exact input. The operation id and any
 * unapplied proposal live in the editor-level session map, so closing and
 * reopening never starts a second paid request for the same input; unknown
 * settlement only re-checks that id. Mount with `key={sessionKey}` so a changed
 * input starts from its own session.
 */
export function useRepairFlow({ sessionKey, createOperationId, run }: Options) {
  const sessions = useCitationContext()?.repairSessions;
  const [proposal, setProposal] = useState<CitationRepair | null>(
    () => sessions?.get(sessionKey)?.proposal ?? null
  );
  const [phase, setPhase] = useState<RepairPhase>({ kind: 'idle' });

  const mutation = useMutation({
    mutationFn: (key: string) => {
      let session = sessions?.get(key);
      if (!session) {
        session = { operationId: createOperationId(), proposal: null };
        sessions?.set(key, session);
      }
      return run(session.operationId);
    },
    retry: false,
    // Runs even if the surface closed meanwhile, so the paid result is kept.
    onSuccess: (result, key) => {
      const session = sessions?.get(key);
      if (!session) return;
      if (result.status === 'ok') {
        sessions?.set(key, { ...session, proposal: result.data });
      } else if (classifyRepairFailure(result).retry === 'new') {
        sessions?.delete(key);
      }
    },
  });

  const start = () => {
    setPhase({ kind: 'idle' });
    mutation.mutate(sessionKey, {
      onSuccess: (result) => {
        if (result.status === 'ok') setProposal(result.data);
        else
          setPhase({ kind: 'failed', failure: classifyRepairFailure(result) });
      },
      onError: () =>
        setPhase({ kind: 'failed', failure: classifyRepairFailure(null) }),
    });
  };

  /** A started session resumes; only a brand-new paid request is confirmed. */
  const request = () =>
    sessions?.has(sessionKey) ? start() : setPhase({ kind: 'confirm' });

  /** Ends the session after the proposal was used or rejected. */
  const settle = (next: RepairPhase = { kind: 'idle' }) => {
    sessions?.delete(sessionKey);
    setProposal(null);
    setPhase(next);
  };

  const view: RepairView = mutation.isPending
    ? { kind: 'pending' }
    : proposal
      ? { kind: 'review', proposal }
      : phase;

  return {
    view,
    request,
    start,
    settle,
    cancel: () => setPhase({ kind: 'idle' }),
    /** True while a session (pending or reviewable) exists for this input. */
    hasSession: () => sessions?.has(sessionKey) ?? false,
  };
}

export type RepairFlow = ReturnType<typeof useRepairFlow>;
