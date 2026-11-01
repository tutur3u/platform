// Shared `--dry-run` flag handling for release scripts. Only the exact token
// `--dry-run` is consumed; every other argument, in order, is returned
// untouched, so an invocation without the flag sees exactly its old argv.
export const DRY_RUN_FLAG = '--dry-run';

export function parseDryRunArgs(argv) {
  const args = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === DRY_RUN_FLAG) dryRun = true;
    else args.push(arg);
  }
  return { dryRun, args };
}
