import type { CitationLookupResult } from '@tuturuuu/internal-api/cite';
import {
  type CitationDraft,
  draftFromLookup,
  emptyDraft,
  type LookupErrorCode,
} from './citation-draft';

export type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading'; requestId: number; revision: number }
  | {
      kind: 'review';
      source: Exclude<CitationLookupResult['source'], 'manual'>;
    }
  | { kind: 'manual' }
  | { kind: 'stale'; result: CitationLookupResult }
  | { kind: 'error'; code: LookupErrorCode };

export type CitationState = {
  draft: CitationDraft;
  /** Increments on every draft change so late lookups cannot overwrite edits. */
  revision: number;
  lookup: LookupState;
};

export type CitationEvent =
  | { type: 'edit'; update: (draft: CitationDraft) => CitationDraft }
  | { type: 'lookupStarted'; requestId: number }
  | { type: 'lookupSucceeded'; requestId: number; result: CitationLookupResult }
  | { type: 'lookupFailed'; requestId: number; code: LookupErrorCode }
  | { type: 'applyStale' }
  | { type: 'dismissLookup' }
  | { type: 'reset' };

export function initialCitationState(): CitationState {
  return { draft: emptyDraft(), revision: 0, lookup: { kind: 'idle' } };
}

function applyResult(
  state: CitationState,
  result: CitationLookupResult
): CitationState {
  return {
    draft: draftFromLookup(result.fields),
    revision: state.revision + 1,
    lookup:
      result.source === 'manual'
        ? { kind: 'manual' }
        : { kind: 'review', source: result.source },
  };
}

function isCurrentRequest(state: CitationState, requestId: number) {
  return (
    state.lookup.kind === 'loading' && state.lookup.requestId === requestId
  );
}

export function citationReducer(
  state: CitationState,
  event: CitationEvent
): CitationState {
  switch (event.type) {
    case 'edit':
      return {
        ...state,
        draft: event.update(state.draft),
        revision: state.revision + 1,
      };
    case 'lookupStarted':
      return {
        ...state,
        lookup: {
          kind: 'loading',
          requestId: event.requestId,
          revision: state.revision,
        },
      };
    case 'lookupSucceeded': {
      if (!isCurrentRequest(state, event.requestId)) return state;
      if (
        state.lookup.kind === 'loading' &&
        state.lookup.revision !== state.revision
      )
        return { ...state, lookup: { kind: 'stale', result: event.result } };
      return applyResult(state, event.result);
    }
    case 'lookupFailed':
      if (!isCurrentRequest(state, event.requestId)) return state;
      return { ...state, lookup: { kind: 'error', code: event.code } };
    case 'applyStale':
      if (state.lookup.kind !== 'stale') return state;
      return applyResult(state, state.lookup.result);
    case 'dismissLookup':
      return { ...state, lookup: { kind: 'idle' } };
    case 'reset':
      return initialCitationState();
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
