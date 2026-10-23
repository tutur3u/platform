#!/usr/bin/env bun
const args = process.argv.slice(2);
const local = args[0] === 'backlog' || args[0] === 'operational-memory';
const run =
  args[0] === 'resources'
    ? import('./resources.js').then(({ runResourcesCommand }) =>
        runResourcesCommand(args.slice(1))
      )
    : args[0] === 'storage'
      ? import('./storage.js').then(({ runStorageCommand }) =>
          runStorageCommand(args.slice(1))
        )
      : local
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
