import { execFileSync } from 'node:child_process';
export type ProcessState =
  | 'same'
  | 'dead'
  | 'replaced'
  | 'permission-denied'
  | 'unknown';
export function processStartedAt(pid: number): string | undefined {
  try {
    const text = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  } catch {
    return undefined;
  }
}
export function processState(pid: number, startedAt: string): ProcessState {
  try {
    process.kill(pid, 0);
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ESRCH') return 'dead';
    if (code === 'EPERM') return 'permission-denied';
    return 'unknown';
  }
  const actual = processStartedAt(pid);
  if (!actual || !Number.isFinite(Date.parse(startedAt))) return 'unknown';
  return Math.abs(Date.parse(actual) - Date.parse(startedAt)) < 1000
    ? 'same'
    : 'replaced';
}
