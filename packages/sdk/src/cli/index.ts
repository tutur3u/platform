#!/usr/bin/env bun
import { installedBuildIdentity } from './build-identity';

const args = process.argv.slice(2);
const board =
  args[0] === 'board' || (args[0] === 'help' && args[1] === 'board');
const local = args[0] === 'backlog' || args[0] === 'operational-memory';
const externalUpskii = args[0] === 'external' && args[1] === 'upskii';
const separator = args.indexOf('--');
const globalArgs = separator >= 0 ? args.slice(0, separator) : args;
const run =
  args[0] !== 'ieeai' &&
  args[0] !== 'fleet' &&
  args[0] !== 'resources' &&
  args[0] !== 'storage' &&
  args[0] !== 'balancer' &&
  args[0] !== 'git' &&
  args[0] !== 'doctor' &&
  args[0] !== 'env' &&
  args[0] !== 'infra' &&
  args[0] !== 'db' &&
  args[0] !== 'completions' &&
  !externalUpskii &&
  !local &&
  (globalArgs.includes('--version') || globalArgs.includes('-v'))
    ? Promise.resolve().then(() => {
        process.stdout.write(`${installedBuildIdentity().version}\n`);
      })
    : externalUpskii
      ? import('./upskii/index.js').then(({ runUpskiiCommand }) =>
          runUpskiiCommand(args.slice(2))
        )
      : args[0] === 'infra'
        ? import('./infra/index.js').then(({ runInfraCommand }) =>
            runInfraCommand(args.slice(1))
          )
        : args[0] === 'db'
          ? import('./db/index.js').then(({ runDbCommand }) =>
              runDbCommand(args.slice(1))
            )
          : args[0] === 'completions'
            ? import('./completions.js').then(({ runCompletionsCommand }) =>
                runCompletionsCommand(args.slice(1))
              )
            : args[0] === 'doctor'
              ? import('./doctor.js').then(({ runDoctorCommand }) =>
                  runDoctorCommand(args.slice(1))
                )
              : args[0] === 'env'
                ? import('./env-command.js').then(({ runEnvCommand }) =>
                    runEnvCommand(args.slice(1))
                  )
                : args[0] === 'fleet'
                  ? import('./fleet.js').then(({ runFleetCommand }) =>
                      runFleetCommand(args.slice(1))
                    )
                  : args[0] === 'resources'
                    ? import('./resources.js').then(({ runResourcesCommand }) =>
                        runResourcesCommand(args.slice(1))
                      )
                    : args[0] === 'storage'
                      ? import('./storage.js').then(({ runStorageCommand }) =>
                          runStorageCommand(args.slice(1))
                        )
                      : args[0] === 'balancer'
                        ? import('./balancer-cli.js').then(
                            ({ runBalancerCommand }) =>
                              runBalancerCommand(args.slice(1))
                          )
                        : args[0] === 'git'
                          ? import('./git-guard.js').then(({ runGitCommand }) =>
                              runGitCommand(args.slice(1))
                            )
                          : local
                            ? import('./operational-cli.js').then(
                                ({ runOperationalCli }) =>
                                  runOperationalCli(args)
                              )
                            : board
                              ? import('./board-command.js').then(
                                  ({ runBoardCommand }) =>
                                    runBoardCommand(
                                      args[0] === 'board'
                                        ? args.slice(1)
                                        : ['--help']
                                    )
                                )
                              : args[0] === 'ieeai'
                                ? import('./ieeai.js').then(
                                    ({ runIeeaiCommand }) =>
                                      runIeeaiCommand(args.slice(1))
                                  )
                                : import('./commands.js').then(({ runCli }) =>
                                    runCli()
                                  );
run.catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
