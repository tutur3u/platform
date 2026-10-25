import {
  activateRelease,
  cliStore,
  installRelease,
  listReleases,
  pruneReleases,
} from './cli-versions';
import { upgradeCli } from './upgrade';

export const cliVersionActions = ['install', 'activate', 'list', 'prune'];

// `ttr upgrade` alone keeps the legacy in-place Bun global upgrade; an
// unknown subcommand must never fall through to a global install.
export async function runUpgrade(
  action: string | undefined,
  args: string[],
  json: boolean,
  keep?: unknown
) {
  if (!action) return upgradeCli();
  if (!cliVersionActions.includes(action))
    throw new Error(
      `Unknown upgrade action "${action}". Use ttr upgrade --help.`
    );
  return runCliVersionsCommand(action, args, json, keep);
}

export async function runCliVersionsCommand(
  action: string,
  args: string[],
  json: boolean,
  keep?: unknown
) {
  const write = (value: unknown, text: string) =>
    process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : text);
  if (action === 'install') {
    const result = await installRelease({ spec: args[0] ?? 'latest' });
    write(
      result,
      `${result.reused ? 'Already installed' : 'Installed'} tuturuuu@${result.release.version} at ${result.path} (${result.release.files} files, ${result.release.integrity}).\nActivate it with: ttr upgrade activate ${result.release.version}\n`
    );
    return;
  }
  if (action === 'activate') {
    if (!args[0]) throw new Error('Use ttr upgrade activate <version>.');
    const result = await activateRelease({ version: args[0] });
    write(
      result,
      `Activated tuturuuu@${result.release.version}${result.previous ? ` (previous: ${result.previous})` : ''}${result.shims ? '; resource shims now run it' : ''}.\nLaunchers: ${cliStore()}/bin\n`
    );
    return;
  }
  if (action === 'list') {
    const releases = await listReleases();
    write(
      releases,
      releases.length
        ? `${releases
            .map(
              (entry) =>
                `${entry.current ? '*' : ' '} ${entry.version}${entry.previous ? ' (previous)' : ''}${entry.verified ? '' : ' (does not verify)'}`
            )
            .join('\n')}\n`
        : 'No side-by-side releases installed.\n'
    );
    return;
  }
  if (action === 'prune') {
    const removed = await pruneReleases({
      keep: typeof keep === 'string' ? Number(keep) : Number.NaN,
    });
    write(
      { removed },
      removed.length
        ? `Removed ${removed.join(', ')}.\n`
        : 'Nothing to prune.\n'
    );
  }
}
