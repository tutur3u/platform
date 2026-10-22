export async function refreshConfirmedAction<T>(
  result: T,
  refresh: () => Promise<unknown>
): Promise<T> {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('data' in result) ||
    !result.data ||
    ('error' in result && result.error)
  )
    return result;
  try {
    await refresh();
  } catch {
    console.warn('Meet view refresh failed after a confirmed action');
  }
  return result;
}
