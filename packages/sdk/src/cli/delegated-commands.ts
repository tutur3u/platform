// Commands that own their argument parsing and bypass the workspace CLI.
// Both modules load lazily so ordinary CLI commands skip their imports.
export function isDelegatedCommand(command: string | undefined) {
  return command === 'resources' || command === 'storage';
}

export async function runDelegatedCommand(argv: string[]) {
  return argv[0] === 'storage'
    ? (await import('./storage.js')).runStorageCommand(argv.slice(1))
    : (await import('./resources.js')).runResourcesCommand(argv.slice(1));
}
