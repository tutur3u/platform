'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useSyncExternalStore } from 'react';

/**
 * The latest sign-in error toast, mirrored so the sign-in card can repeat it
 * inline with role=alert. Toasts keep their exact copy and diagnostic codes;
 * this only reads what was shown. Nothing here is persisted.
 */
export type AuthInlineError = {
  description?: string;
  id: number;
  /** The diagnostic code inside the description, when it carries one. */
  reference?: string;
  title: string;
};

/** Matches client (`AUTH-PASSKEY-1A2B3C`) and server diagnostic codes. */
const DIAGNOSTIC_REFERENCE_PATTERN = /\bAUTH(?:-[A-Z]+)+-[0-9A-F]{6}\b/u;

let latest: AuthInlineError | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

export function extractDiagnosticReference(text?: string | null) {
  return text?.match(DIAGNOSTIC_REFERENCE_PATTERN)?.[0];
}

export function reportAuthInlineError(title: unknown, description?: unknown) {
  if (typeof title !== 'string' || !title) return;
  const text = typeof description === 'string' ? description : undefined;
  sequence += 1;
  latest = {
    description: text,
    id: sequence,
    reference: extractDiagnosticReference(text),
    title,
  };
  for (const listener of listeners) listener();
}

/** The id of the latest reported error, or 0 before any error. */
export function latestAuthInlineErrorId() {
  return latest?.id ?? 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLatestAuthInlineError() {
  return useSyncExternalStore(
    subscribe,
    () => latest,
    () => null
  );
}

type ErrorArgs = Parameters<typeof toast.error>;

/**
 * Drop-in for sonner's `toast` in the sign-in flow: every call reaches sonner
 * unchanged, and error toasts are also mirrored for the inline alert.
 */
export const authToast = {
  error: (...[message, data]: ErrorArgs) => {
    reportAuthInlineError(message, data?.description);
    return toast.error(message, data);
  },
  success: (...args: Parameters<typeof toast.success>) =>
    toast.success(...args),
  warning: (...args: Parameters<typeof toast.warning>) =>
    toast.warning(...args),
};
