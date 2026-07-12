/**
 * Compatibility hook for user-group overview mutations.
 *
 * The overview currently uses React's request-scoped `cache()`, so there is no
 * persistent tag cache to invalidate. Keep this function as a stable mutation
 * hook so callers do not need to know which cache strategy is active.
 */
export function revalidateUserGroupCache(_groupId: string) {
  // No-op until a production-safe persistent cache strategy is enabled.
}
