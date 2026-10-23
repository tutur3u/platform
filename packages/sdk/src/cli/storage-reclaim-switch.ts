import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Automatic reclaim is OFF by default. Two inputs control it:
// - TTR_STORAGE_AUTO_RECLAIM in the process environment (or a passed env);
// - the sentinel file `<storage home>/auto-reclaim` (this storage authority).
// A true value (1, true, on, yes) in either opts both triggers in (heavy
// admission and the devbox heartbeat). A false value (0, false, off, no) in
// either is a hard kill switch that also blocks a manual
// `ttr storage reclaim --apply`, and it wins over any opt-in. A sentinel file
// with any other content, or one that cannot be read, also kills (fail
// closed). The engine checks the kill switch before the lease, before every
// item and inside the lease guard right before each removal.

const TRUE = new Set(['1', 'true', 'on', 'yes']);
const FALSE = new Set(['0', 'false', 'off', 'no']);
const norm = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

export const reclaimSentinel = (home: string) => join(home, 'auto-reclaim');

type Sentinel = 'absent' | 'on' | 'off';

function readSentinel(home: string | undefined): Sentinel {
  if (!home) return 'absent';
  let text: string;
  try {
    text = readFileSync(reclaimSentinel(home), 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'absent'
      : 'off';
  }
  return TRUE.has(norm(text)) ? 'on' : 'off';
}

export function killSwitchOn(env?: NodeJS.ProcessEnv, home?: string) {
  return (
    FALSE.has(norm(process.env.TTR_STORAGE_AUTO_RECLAIM)) ||
    FALSE.has(norm(env?.TTR_STORAGE_AUTO_RECLAIM)) ||
    readSentinel(home) === 'off'
  );
}

/** Whether the automatic triggers may run (explicit opt-in, no kill switch). */
export function autoReclaimEnabled(
  env: NodeJS.ProcessEnv = process.env,
  home?: string
) {
  if (killSwitchOn(env, home)) return false;
  return (
    TRUE.has(norm(env.TTR_STORAGE_AUTO_RECLAIM)) || readSentinel(home) === 'on'
  );
}
