import { userInfo } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

let injectedBase: string | undefined;

export function setStateRootBaseForTests(base: string | undefined) {
  injectedBase = base;
}

export function stateRoot(...segments: string[]) {
  const base =
    process.env.AGENT_QUOTA_STATE_ROOT || injectedBase || userInfo().homedir;
  return join(base, ...segments);
}

export function assertSafeStateWrite(path: string) {
  if (!process.env.VITEST) return;
  const home = resolve(userInfo().homedir);
  const target = resolve(path);
  const rel = relative(home, target);
  if (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  )
    throw new Error('test-state-write-under-user-home');
}
