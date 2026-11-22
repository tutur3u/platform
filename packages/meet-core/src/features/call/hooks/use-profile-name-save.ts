'use client';

import {
  InternalApiError,
  updateCurrentUserProfile,
} from '@tuturuuu/internal-api';
import { useRef, useState } from 'react';

/** One state at a time: the browser check and the save never disagree. */
export type NameSaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  /** The save was refused pending a browser check; `name` waits for its token. */
  | { kind: 'verifying'; name: string }
  | { kind: 'failed'; reason: 'save' | 'verification' };

function needsVerification(error: unknown) {
  if (!(error instanceof InternalApiError)) return false;
  const { code } = error as { code?: string };
  return code === 'ABUSE_CHALLENGE_REQUIRED';
}

/**
 * Saves the profile display name through Web's profile API. Web may refuse
 * the save with `ABUSE_CHALLENGE_REQUIRED`; the caller then renders
 * `ParticipantNameCheck` and passes its one-use token to `save` once. A
 * second refusal, or a refusal without a site key, ends the attempt.
 */
export function useProfileNameSave({
  siteKey,
  onSaved,
  onFailed,
}: {
  siteKey?: string;
  onSaved: (name: string) => void | Promise<void>;
  /** Called once when an attempt ends without a saved name. */
  onFailed?: (reason: 'save' | 'verification') => void;
}) {
  const [state, setState] = useState<NameSaveState>({ kind: 'idle' });
  const handlers = useRef({ onSaved, onFailed });
  handlers.current = { onSaved, onFailed };

  const fail = (reason: 'save' | 'verification') => {
    setState({ kind: 'failed', reason });
    handlers.current.onFailed?.(reason);
  };

  /** A token is single-use, so a save refused again after the check ends the attempt. */
  const save = async (displayName: string, turnstileToken?: string) => {
    setState({ kind: 'saving' });
    try {
      await updateCurrentUserProfile(
        { display_name: displayName },
        undefined,
        turnstileToken ? { turnstileToken } : undefined
      );
    } catch (error) {
      if (!needsVerification(error)) fail('save');
      else if (siteKey && !turnstileToken)
        setState({ kind: 'verifying', name: displayName });
      else fail('verification');
      return;
    }
    setState({ kind: 'idle' });
    await handlers.current.onSaved(displayName);
  };

  return {
    state,
    save,
    /** The browser check could not run or failed. */
    failVerification: () => fail('verification'),
    /** Ends a pending check, so its late result saves nothing. */
    reset: () => setState({ kind: 'idle' }),
    busy: state.kind === 'saving' || state.kind === 'verifying',
  };
}
