#!/usr/bin/env bun
const args = process.argv.slice(2);
const local = args[0] === 'backlog' || args[0] === 'operational-memory';
const run = local
  ? import('./operational-cli.js').then(({ runOperationalCli }) =>
      runOperationalCli(args)
    )
  : import('./commands.js').then(({ runCli }) => runCli());
run.catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
