// Two-participant acceptance of the staging execution Worker, run by the
// staging acceptance workflow. It opens admission, then for every language
// one participant Runs the stock template through the production /run,
// /result contract with a signed staging fixture ticket, the other reads that
// result, and they swap. Admission is paused again whatever happens, and the
// report records every Run.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PLAYGROUND_LANGUAGES } from '../../packages/types/src/primitives/playgrounds.ts';

import './src/worker-test-runtime.mjs';

const { fixtureTicket } = await import('./src/fixture-source.ts');

const [origin, reportPath] = process.argv.slice(2);
const ingress = process.env.PLAYGROUND_INGRESS_SECRET ?? '';
const operator = process.env.PLAYGROUND_OPERATOR_SECRET ?? '';
if (
  !/^https:\/\/tuturuuu-playground-execution-staging\.[a-z0-9-]+\.workers\.dev$/u.test(
    origin ?? ''
  ) ||
  !reportPath ||
  ingress.length < 32 ||
  operator.length < 32
) {
  throw new Error('Pass the staging origin, a report path and both secrets');
}

const RUN_DEADLINE_MS = 75_000;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

async function call(path, body, secret = ingress) {
  const response = await fetch(new URL(path, origin), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

async function gate(enabled) {
  const { status, body } = await call('/control', { enabled }, operator);
  if (body?.enabled !== enabled) {
    throw new Error(`Admission did not become ${enabled}: HTTP ${status}`);
  }
  return body;
}

async function run(identity, requester, language) {
  const started = Date.now();
  const sourceTicket = await fixtureTicket(ingress, {
    projectId: identity.projectId,
    revision: 0,
    language,
    expiresAt: Date.now() + 10 * 60_000,
  });
  const submit = await call('/run', {
    ...identity,
    requester,
    requestId: randomUUID(),
    revision: 0,
    sourceTicket,
    // Fixture Runs never write back; the export ticket only has to be well formed.
    exportTicket: `${sourceTicket}.export`.slice(0, 2048),
  });
  if (submit.status !== 202)
    return { submitted: submit, ms: Date.now() - started };
  const { runId } = submit.body;
  for (;;) {
    const read = await call('/result', { ...identity, runId });
    if (read.status === 200 && TERMINAL.has(read.body.status)) {
      return { runId, result: read.body, ms: Date.now() - started };
    }
    if (Date.now() - started > RUN_DEADLINE_MS) {
      await call('/stop', { ...identity, runId });
      return {
        runId,
        result: read.body,
        ms: Date.now() - started,
        timedOut: true,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const passed = (entry) =>
  entry.result?.status === 'succeeded' &&
  entry.result.exitCode === 0 &&
  entry.result.output.trim() === 'Hello, playground!';

const report = { origin, startedAt: new Date().toISOString(), cases: [] };
let failure;
try {
  report.opened = await gate(true);
  for (const language of PLAYGROUND_LANGUAGES) {
    const identity = {
      ownerId: randomUUID(),
      projectId: randomUUID(),
      meetingId: randomUUID(),
    };
    const participants = [randomUUID(), randomUUID()];
    const entries = [];
    for (const [runner, viewer] of [
      participants,
      [...participants].reverse(),
    ]) {
      const entry = await run(identity, runner, language);
      // The other participant in the room reads the same Run.
      const seen = entry.runId
        ? await call('/result', { ...identity, runId: entry.runId })
        : undefined;
      entries.push({
        ...entry,
        seenByOther:
          seen?.status === 200 &&
          seen.body.output === entry.result?.output &&
          seen.body.status === entry.result?.status,
        viewer: viewer === participants[0] ? 'A' : 'B',
      });
    }
    report.cases.push({
      language,
      passed: entries.every((entry) => passed(entry) && entry.seenByOther),
      runs: entries.map(({ ms, result, seenByOther, timedOut, submitted }) => ({
        ms,
        status: result?.status ?? submitted?.body?.code ?? submitted?.status,
        exitCode: result?.exitCode,
        output: result?.output?.slice(0, 200),
        seenByOther,
        timedOut: timedOut ?? false,
      })),
    });
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  try {
    report.closed = await gate(false);
  } catch (error) {
    failure ??= error instanceof Error ? error.message : String(error);
    report.closeFailed = true;
  }
}
report.failure = failure ?? null;
report.passed =
  !failure &&
  report.cases.length === PLAYGROUND_LANGUAGES.length &&
  report.cases.every((entry) => entry.passed);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, failure: report.failure }));
for (const entry of report.cases)
  console.log(
    `${entry.language}: ${entry.passed ? 'passed' : 'FAILED'} ${entry.runs.map((r) => `${r.status}/${r.ms}ms`).join(' ')}`
  );
if (!report.passed) process.exit(1);
