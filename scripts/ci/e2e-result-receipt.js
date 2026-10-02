const fs = require('node:fs');
const path = require('node:path');

// Store counts and provenance only. Playwright reports can contain tokens,
// response bodies and synthetic customer data; none belongs in a shared cache.
function createReceipt(report, { key, suite, sha, runId, attempt, now }) {
  const stats = report?.stats;
  if (
    !stats ||
    !['expected', 'unexpected', 'flaky', 'skipped'].every(
      (name) => Number.isSafeInteger(stats[name]) && stats[name] >= 0
    ) ||
    stats.expected === 0 ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0 ||
    !Array.isArray(report.errors) ||
    report.errors.length > 0 ||
    !/^[a-zA-Z0-9_-]{1,512}$/u.test(key ?? '') ||
    !/^[a-f0-9]{40}$/u.test(sha ?? '') ||
    !/^[a-zA-Z0-9_/-]{1,80}$/u.test(suite ?? '') ||
    !/^\d+$/u.test(runId ?? '') ||
    !/^\d+$/u.test(attempt ?? '')
  )
    return null;
  return {
    version: 1,
    key,
    suite,
    sha,
    runId,
    attempt,
    completedAt: now.toISOString(),
    stats: Object.fromEntries(
      ['expected', 'unexpected', 'flaky', 'skipped'].map((name) => [
        name,
        stats[name],
      ])
    ),
  };
}

function runnerMatches(env) {
  try {
    const expected = JSON.parse(env.E2E_EXPECTED_RUNNER);
    return Boolean(
      expected &&
        typeof expected.image === 'string' &&
        expected.image.length > 0 &&
        typeof expected.os === 'string' &&
        expected.os.length > 0 &&
        typeof expected.arch === 'string' &&
        expected.arch.length > 0 &&
        expected.image === env.ImageVersion &&
        expected.os === env.RUNNER_OS &&
        expected.arch === env.RUNNER_ARCH
    );
  } catch {
    return false;
  }
}

function recordReceipt(env = process.env) {
  let receipt = null;
  // Defense in depth: workflow_dispatch runs fully but never publishes proofs.
  if (
    env.GITHUB_EVENT_NAME === 'push' &&
    env.GITHUB_REF === 'refs/heads/main'
  ) {
    try {
      const report = JSON.parse(fs.readFileSync(env.E2E_RESULTS_PATH, 'utf8'));
      receipt = createReceipt(report, {
        key: env.E2E_PROOF_KEY,
        suite: env.E2E_SUITE_ID,
        sha: env.GITHUB_SHA,
        runId: env.GITHUB_RUN_ID,
        attempt: env.GITHUB_RUN_ATTEMPT,
        now: new Date(),
      });
    } catch {
      // Missing/malformed evidence must not create a reusable success.
    }
  }
  if (receipt) {
    fs.mkdirSync('tmp', { recursive: true });
    fs.writeFileSync(
      path.join('tmp', 'e2e-proof-receipt.json'),
      `${JSON.stringify(receipt)}\n`
    );
  }
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(env.GITHUB_OUTPUT, `reusable=${Boolean(receipt)}\n`);
  console.log(
    receipt
      ? 'Recorded passing, non-flaky E2E counts for trusted reuse.'
      : 'E2E result is not reusable; future runs will execute this suite.'
  );
  return receipt;
}

if (require.main === module) recordReceipt();
module.exports = { createReceipt, recordReceipt, runnerMatches };
