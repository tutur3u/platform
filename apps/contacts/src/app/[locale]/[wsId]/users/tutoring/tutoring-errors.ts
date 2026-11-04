/** `code` the tutoring API answers with when the weak-content policy denies a write. */
export const TUTORING_CONTENT_RESTRICTED = 'TUTORING_CONTENT_RESTRICTED';

export function isTutoringContentRestricted(error: unknown) {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === TUTORING_CONTENT_RESTRICTED
  );
}
