const CHECK_FLAGS = new Set([
  '--table',
  '--timing',
  '--details',
  '--run-all',
  '--force-now',
]);

function checkCliArgs(args) {
  const unknown = args.find((arg) => !CHECK_FLAGS.has(arg));
  if (unknown === undefined) return;
  process.stderr.write(
    `Usage: bun validate ${[...CHECK_FLAGS].map((flag) => `[${flag}]`).join(' ')}; Unknown bun validate argument: ${JSON.stringify(unknown)}\n`
  );
  process.exit(1);
}

module.exports = { checkCliArgs };
