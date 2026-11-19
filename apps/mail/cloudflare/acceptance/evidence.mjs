import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

/** Status and header names only: never a body, a header value or a secret. */
export function describe(response) {
  return {
    status: response.status,
    headerNames: [...response.headers.keys()].sort(),
  };
}

export function expectStatus(response, status, label) {
  if (response.status !== status)
    throw new Error(`${label}: expected ${status}, got ${response.status}`);
}

/** Records one named step. A failure is evidence; later steps still run. */
export function createEvidence(meta) {
  const steps = [];
  return {
    steps,
    async step(name, run) {
      const started = Date.now();
      const entry = { name, ok: false };
      try {
        Object.assign(entry, (await run()) ?? {}, { ok: true });
      } catch (error) {
        entry.error =
          error instanceof Error ? error.message.slice(0, 300) : 'unknown';
      }
      entry.ms = Date.now() - started;
      steps.push(entry);
      console.log(
        `${entry.ok ? 'PASS' : 'FAIL'} ${name}${entry.error ? `: ${entry.error}` : ''}`
      );
      return entry;
    },
    async write(path, extra) {
      const evidence = {
        schema: 1,
        finishedAt: new Date().toISOString(),
        ...meta,
        ...extra,
        passed: steps.filter((step) => step.ok).length,
        failed: steps.filter((step) => !step.ok).length,
        steps,
      };
      await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
      return evidence;
    },
  };
}
