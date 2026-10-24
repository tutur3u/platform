import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { resourceShims } from './resources-command';

export const budgetLauncherProtocol = '# Resource scheduler protocol: 3';
const upgrade =
  'Upgrade every global ttr install to the budget-capable release and refresh shims with ttr resources setup using the existing roots before admitting work. No budget fence was published.';

async function launchers(home: string) {
  const entries: { path: string; content: string }[] = [];
  for (const name of resourceShims) {
    const path = join(home, 'bin', name);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(
        path,
        constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
      );
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 16_384)
        throw new Error(`Cannot verify resource launcher ${path}. ${upgrade}`);
      entries.push({ path, content: await file.readFile('utf8') });
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
    } finally {
      await file?.close();
    }
  }
  return entries;
}

export async function assertBudgetLaunchers(home: string) {
  for (const entry of await launchers(home)) {
    if (!entry.content.split('\n').includes(budgetLauncherProtocol))
      throw new Error(
        `Older or unverified resource launcher still installed: ${entry.path}. ${upgrade}`
      );
  }
}

const globalEntry = (entry: string) =>
  entry.replace(
    /\/\.bun\/install\/cache\/links\/tuturuuu@[^/]+\/node_modules\/tuturuuu\/dist\/cli\//u,
    '/.bun/install/global/node_modules/tuturuuu/dist/cli/'
  );
const installRoot = (entry: string) =>
  entry.replace(/\/(?:src|dist)\/cli\/resources-entry\.(?:js|ts)$/u, '');

// Setup is an installation transaction, not workload admission. It may refresh
// an older release of the same install before the first protocol-3 admission.
export async function assertBudgetSetupOwner(home: string, incoming: string) {
  const candidate = globalEntry(incoming);
  let verifiedGlobal: string | undefined;
  try {
    if (
      /\/\.bun\/install\/global\/node_modules\/tuturuuu\/dist\/cli\//u.test(
        candidate
      ) &&
      (await realpath(candidate)) === (await realpath(incoming))
    )
      verifiedGlobal = candidate;
  } catch {
    /* A source checkout is a separate installation. */
  }
  const expected = installRoot(verifiedGlobal ?? incoming);
  let upgrading = false;
  for (const entry of await launchers(home)) {
    if (!entry.content.includes('# Managed by ttr resources'))
      throw new Error(
        `Refusing to overwrite unmanaged shim: ${entry.path}. Inspect and move that file explicitly, then rerun setup from ~/.bun/bin/ttr; --force never replaces unmanaged files.`
      );
    if (entry.content.split('\n').includes(budgetLauncherProtocol)) continue;
    upgrading = true;
    const parsed = / exec ('(?:[^']|'\\'')*') ('(?:[^']|'\\'')*') shim /u.exec(
      entry.content
    );
    const old = parsed?.[2]?.slice(1, -1).replaceAll("'\\''", "'");
    if (
      !old ||
      installRoot(verifiedGlobal ? globalEntry(old) : old) !== expected
    )
      throw new Error(
        `Setup refuses a foreign older launcher: ${entry.path}. ${upgrade} Use the upgraded owning global CLI for setup; do not use a source checkout against its home.`
      );
  }
  return upgrading;
}
