// Bounded retention for Mastermind secret entry answers on the orchestrator:
// the publisher deletes secret and pairing spool files older than ten
// minutes on every run, whether or not a request helper is still alive, so
// ciphertext never lingers after its request is over.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#delivery-on-the-machine.
import fs from 'node:fs';
import path from 'node:path';

export const SECRET_SPOOL_MAX_AGE_MS = 10 * 60 * 1000;
const SPOOL = /^(secret|pair)-[0-9a-f]{24}\.r\d+\.json$/;

export function purgeSecretSpools(answersDir, nowMs = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(answersDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!SPOOL.test(name)) continue;
    const file = path.join(answersDir, name);
    try {
      if (nowMs - fs.lstatSync(file).mtimeMs > SECRET_SPOOL_MAX_AGE_MS) {
        fs.rmSync(file, { force: true });
        removed++;
      }
    } catch {
      // Already gone.
    }
  }
  return removed;
}
