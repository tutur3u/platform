const safeNames = new Set([
  '(FiberFailure) AiStudioError',
  '(FiberFailure) Error',
  'AbortError',
  'AiStudioError',
  'Error',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'ZodError',
]);

const safeMessages = new Set([
  'AI usage could not be settled.',
  'Illegal invocation',
  'Room action is unavailable',
  'Room meeting AI is unavailable. Use Private Mira.',
  'The request could not reserve AI credits.',
  'This request is already running or completed.',
  'fetch failed',
]);

export function logMeetAiError(event: string, error: unknown) {
  if (!(error instanceof Error)) {
    console.error(event, {
      name: 'Unknown',
      message: 'Non-Error thrown',
      stack: [],
    });
    return;
  }

  // Exception text and stack paths can contain request or provider data.
  // Only fixed messages and source coordinates may be emitted.
  const message = typeof error.message === 'string' ? error.message : '';
  const stack = typeof error.stack === 'string' ? error.stack : '';
  const locations = stack
    .split('\n', 24)
    .slice(message.split('\n', 24).length)
    .flatMap((line) => {
      const location = /^\s+at\s+.*:(\d{1,8}):(\d{1,6})\)?\s*$/.exec(line);
      return location ? [`${location[1]}:${location[2]}`] : [];
    })
    .slice(0, 3);
  console.error(event, {
    name: safeNames.has(error.name) ? error.name : 'Error',
    message: safeMessages.has(message) ? message : 'Unexpected exception',
    stack: locations,
  });
}
