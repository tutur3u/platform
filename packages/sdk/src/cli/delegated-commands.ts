// Commands that own their argument parsing and bypass the workspace CLI.
// Both modules load lazily so ordinary CLI commands skip their imports.
export function isDelegatedCommand(command: string | undefined) {
  return (
    command === 'resources' ||
    command === 'storage' ||
    command === 'git' ||
    command === 'check'
  );
}

export async function runDelegatedCommand(argv: string[]) {
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
