#!/usr/bin/env node
const JOB_SECONDS = 45 * 60;
const DIAGNOSTICS_SECONDS = 8 * 60;
const MAX_RUNTIME_SECONDS = JOB_SECONDS - DIAGNOSTICS_SECONDS;

function runtimeBudget(startedAt, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > now) {
    throw new Error('Invalid E2E job start time');
  }
  const remaining = JOB_SECONDS - DIAGNOSTICS_SECONDS - (now - startedAt);
  if (remaining <= 0) {
    throw new Error('E2E runtime budget exhausted during setup');
  }
  return Math.min(MAX_RUNTIME_SECONDS, remaining);
}

if (require.main === module) {
  try {
    process.stdout.write(String(runtimeBudget(Number(process.argv[2]))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { runtimeBudget };
