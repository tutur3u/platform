// Commands that own their argument parsing and bypass the workspace CLI.
// Modules load lazily so ordinary CLI commands skip their imports.
export function isDelegatedCommand(command: string | undefined) {
  return (
    command === 'board' ||
    command === 'resources' ||
    command === 'storage' ||
    command === 'ci' ||
    command === 'git' ||
    command === 'check' ||
    command === 'doctor' ||
    command === 'env' ||
    command === 'infra' ||
    command === 'db' ||
    command === 'completions'
  );
}

export async function runDelegatedCommand(argv: string[]) {
  if (argv[0] === 'ci') {
    process.exitCode = await (
      await import('./ci.js')
    ).runCiCommand(argv.slice(1));
    return;
  }
  if (argv[0] === 'board')
    return (await import('./board-command.js')).runBoardCommand(argv.slice(1));
  if (argv[0] === 'doctor')
    return (await import('./doctor.js')).runDoctorCommand(argv.slice(1));
  if (argv[0] === 'env')
    return (await import('./env-command.js')).runEnvCommand(argv.slice(1));
  if (argv[0] === 'infra')
    return (await import('./infra/index.js')).runInfraCommand(argv.slice(1));
  if (argv[0] === 'db')
    return (await import('./db/index.js')).runDbCommand(argv.slice(1));
  if (argv[0] === 'completions')
    return (await import('./completions.js')).runCompletionsCommand(
      argv.slice(1)
    );
  if (argv[0] === 'git')
    return (await import('./git-guard.js')).runGitCommand(argv.slice(1));
  if (argv[0] === 'check') {
    const code = await (
      await import('./check-command.js')
    ).runCheckCommand(argv.slice(1));
    if (code !== 0) process.exitCode = code;
    return;
  }
  return argv[0] === 'storage'
    ? (await import('./storage.js')).runStorageCommand(argv.slice(1))
    : (await import('./resources.js')).runResourcesCommand(argv.slice(1));
}
