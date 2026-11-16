import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const COMMAND = /^[a-z][a-z0-9-]{0,31}$/u;

// Tests set DESKTOP_COMMAND_STUB_ROOT to a directory of `<command>.mjs` files.
// Node then runs that file with the original argv. A PATH shim is not enough
// on Windows: CreateProcess will not execute a shebang named `gh`, and a
// `.cmd` wrapper hands the `gh api --jq` filter to cmd.exe, which splits it.
// Unset, this is the real executable. A set root never falls through to it.
export function runCommand(command, args, options) {
  const root = process.env.DESKTOP_COMMAND_STUB_ROOT;
  if (root === undefined) return execFileSync(command, args, options);
  if (typeof command !== 'string' || !COMMAND.test(command) || !isAbsolute(root))
    throw new Error('Invalid desktop command stub');
  const stub = resolve(root, `${command}.mjs`);
  const inside = relative(resolve(root), stub);
  if (inside === '' || inside.startsWith('..'))
    throw new Error('Invalid desktop command stub');
  if (!existsSync(stub))
    throw new Error(`Missing desktop command stub for ${command}`);
  return execFileSync(process.execPath, [stub, ...(args ?? [])], options);
}
