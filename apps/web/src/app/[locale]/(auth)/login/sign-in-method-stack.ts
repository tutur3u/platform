import type { LoginMethod } from './last-login-method';

/** Methods offered below the email field, in default order. */
const DEFAULT_ALTERNATIVES = ['google', 'passkey'] as const;

/** Every method the "More options" disclosure can hold, in display order. */
const DISCLOSURE_ORDER: readonly LoginMethod[] = [
  'google',
  'passkey',
  'apple',
  'github',
  'azure',
];

/**
 * The email-first sign-in stack always shows this many methods under the
 * email field, so a remembered method only changes which method fills a slot
 * after hydration, never how many rows the step has.
 */
export const ALTERNATIVE_SLOT_COUNT = DEFAULT_ALTERNATIVES.length;

export type SignInMethodStack = {
  /** Shown first, below the email field and "or". */
  alternatives: LoginMethod[];
  /** True when the email field itself was the last method used here. */
  emailLastUsed: boolean;
  /** Behind the "More options" disclosure. */
  more: LoginMethod[];
};

/**
 * Orders the email-first sign-in step. Email always leads, as a field; then
 * the last-used method (when it is not email), then Google and passkey, so a
 * returning staff member whose last method was Microsoft finds it without
 * opening the disclosure. Presentation only: the stored method and its
 * routing are unchanged.
 */
export function arrangeSignInMethodStack(
  lastUsed: LoginMethod | null
): SignInMethodStack {
  const promoted = lastUsed && lastUsed !== 'email' ? lastUsed : null;
  const alternatives: LoginMethod[] = [
    ...(promoted ? [promoted] : []),
    ...DEFAULT_ALTERNATIVES.filter((method) => method !== promoted),
  ].slice(0, ALTERNATIVE_SLOT_COUNT);
  const more = DISCLOSURE_ORDER.filter(
    (method) => !alternatives.includes(method)
  );

  return { alternatives, emailLastUsed: lastUsed === 'email', more };
}
