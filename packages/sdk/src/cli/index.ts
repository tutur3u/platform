#!/usr/bin/env bun
import { installedBuildIdentity } from './build-identity';

const args = process.argv.slice(2);
const local = args[0] === 'backlog' || args[0] === 'operational-memory';
const separator = args.indexOf('--');
const globalArgs = separator >= 0 ? args.slice(0, separator) : args;
const run =
  args[0] !== 'resources' &&
  args[0] !== 'storage' &&
  args[0] !== 'secrets' &&
  !local &&
  (globalArgs.includes('--version') || globalArgs.includes('-v'))
    ? Promise.resolve().then(() => {
        process.stdout.write(`${installedBuildIdentity().version}\n`);
      })
    : args[0] === 'resources'
      ? import('./resources.js').then(({ runResourcesCommand }) =>
          runResourcesCommand(args.slice(1))
        )
      : args[0] === 'storage'
        ? import('./storage.js').then(({ runStorageCommand }) =>
            runStorageCommand(args.slice(1))
          )
        : args[0] === 'secrets'
          ? import('./secrets.js').then(({ runSecretsCommand }) =>
              runSecretsCommand(args.slice(1))
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
