const CHECK_FLAGS = new Set([
  '--table',
  '--timing',
  '--details',
  '--run-all',
  '--force-now',
]);

function assertKnownCheckArgs(args) {
  for (const arg of args) {
    if (!CHECK_FLAGS.has(arg))
      throw new Error(
        `Unknown bun validate argument: ${arg}. Allowed: ${[...CHECK_FLAGS].join(', ')}`
      );
  }
}

module.exports = { assertKnownCheckArgs };
