/** `code` the tutoring API answers with when the weak-content policy denies a write. */
export const TUTORING_CONTENT_RESTRICTED = 'TUTORING_CONTENT_RESTRICTED';

export function isTutoringContentRestricted(error: unknown) {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === TUTORING_CONTENT_RESTRICTED
  );
}

/** `code` the tutoring API answers with when the class is excluded from tutoring. */
export const TUTORING_GROUP_EXCLUDED = 'TUTORING_GROUP_EXCLUDED';

export function isTutoringGroupExcludedError(error: unknown) {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === TUTORING_GROUP_EXCLUDED
  );
}
