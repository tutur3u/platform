/** Bound both readiness and completion even when docker exec never closes. */
export function boundedSession(child, text, timeoutMs, graceMs = 1000) {
  let output = '',
    errors = '',
    lockedResolve,
    lockedReject,
    doneResolve,
    doneReject;
  const locked = new Promise((resolve, reject) => {
    lockedResolve = resolve;
    lockedReject = reject;
  });
  const done = new Promise((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });
  // A competing session never awaits readiness; callers may await done later.
  locked.catch(() => {});
  done.catch(() => {});
  let escalation;
  const timer = setTimeout(() => {
    const error = new Error('Fixture session deadline exceeded');
    lockedReject(error);
    doneReject(error);
    child.kill('SIGTERM');
    escalation = setTimeout(() => child.kill('SIGKILL'), graceMs);
  }, timeoutMs);
  function clearTimers() {
    clearTimeout(timer);
    clearTimeout(escalation);
  }
  child.stdout.on('data', (data) => {
    output += data;
    if (output.includes('FIXTURE_LOCKED')) lockedResolve();
  });
  child.stderr.on('data', (data) => {
    errors += data;
  });
  child.on('error', () => {
    clearTimers();
    const error = new Error('Fixture session failed to start');
    lockedReject(error);
    doneReject(error);
  });
  child.on('close', (code) => {
    clearTimers();
    if (!output.includes('FIXTURE_LOCKED'))
      lockedReject(new Error('Fixture session closed before acquiring lock'));
    doneResolve({ code, output, errors });
  });
  child.stdin.end(text);
  return { locked, done };
}
