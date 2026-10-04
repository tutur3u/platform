// Error messages may contain authenticated URLs, fixture IDs, or response
// bodies. Emit fixed summaries rather than trying to redact arbitrary text.
export function safeLettinPhaseFailure(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  return {
    name: ['Error', 'TimeoutError', 'AssertionError'].includes(name)
      ? name
      : 'UnknownError',
    message: message.includes('toHaveURL')
      ? 'navigation URL assertion failed'
      : message.includes('locator.click')
        ? 'locator click failed'
        : name === 'TimeoutError'
          ? 'operation timed out'
          : 'operation failed',
  };
}
