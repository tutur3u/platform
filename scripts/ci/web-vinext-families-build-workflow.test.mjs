import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PUBLIC_BUILD_ENV } from './web-vinext-seal.mjs';

// The families build workflow is a public-repo build: dispatch only, read-only
// token, no secrets, no Cloudflare credential, pinned actions.
const workflow = readFileSync(
  new URL('../../.github/workflows/web-vinext-families-build.yaml', import.meta.url),
  'utf8'
);
const lines = workflow.split('\n');

/** The text of one job, from its key to the next job key. */
function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `${name} job missing`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/u);
  return next < 0
    ? workflow.slice(start + 1)
    : workflow.slice(start + 1, start + 1 + next);
}
const pinJobs = ['plan', 'build', 'receipt'];

/** The lines of the top-level `key:` block (without the key line). */
function topLevelBlock(key) {
  const start = lines.findIndex((line) => line === `${key}:`);
  assert.ok(start >= 0, `${key} block missing`);
  const end = lines.findIndex(
    (line, index) => index > start && /^\S/u.test(line)
  );
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

test('the workflow runs on workflow_dispatch only', () => {
  const triggers = topLevelBlock('on')
    .filter((line) => /^ {2}\S/u.test(line))
    .map((line) => line.trim());
  assert.deepEqual(triggers, ['workflow_dispatch:']);
  assert.doesNotMatch(
    workflow,
    /\b(?:pull_request|pull_request_target|push|schedule|workflow_run|workflow_call|repository_dispatch)\s*:/u
  );
  const inputs = topLevelBlock('on').join('\n');
  assert.match(inputs, /^ {6}sha:\n(?: {8}.*\n)*? {8}required: true/mu);
  assert.match(inputs, /^ {6}families:\n(?: {8}.*\n)*? {8}required: false/mu);
});

function permissionsOf(text) {
  const match = /^ {4}permissions:\n((?: {6}.*\n)+)/mu.exec(`${text}\n`);
  assert.ok(match, 'job declares its permissions');
  return match[1].trim().split('\n').map((line) => line.trim()).sort();
}

test('jobs that run pin code hold contents: read only', () => {
  assert.deepEqual(
    topLevelBlock('permissions').map((line) => line.trim()),
    ['contents: read']
  );
  for (const name of pinJobs) {
    assert.deepEqual(permissionsOf(job(name)), ['contents: read'], name);
    assert.doesNotMatch(job(name), /id-token|attestations|:\s*write\b/u, name);
  }
  assert.doesNotMatch(workflow, /permissions:\s*(?:write-all|read-all)/u);
});

test('only the attest job signs, and it runs no pin code', () => {
  const attest = job('attest');
  assert.deepEqual(permissionsOf(attest), [
    'actions: read',
    'attestations: write',
    'id-token: write',
  ]);
  assert.match(attest, /^ {4}needs: \[plan, receipt\]$/mu);
  assert.doesNotMatch(attest, /actions\/checkout|setup-node|setup-bun|\bnode |\bbun |download-artifact|scripts\//u);
  assert.match(attest, /actions\/attest-build-provenance@[0-9a-f]{40}/u);
  assert.match(attest, /subject-checksums:/u);
  const writers = workflow.split('\n').filter((line) => /:\s*write\b/u.test(line));
  assert.equal(writers.length, 2);
  assert.match(workflow, /^run-name: Web vinext families \$\{\{ inputs\.sha \}\}$/mu);
});

test('the workflow reads no secret and carries no Cloudflare credential', () => {
  assert.doesNotMatch(workflow, /secrets\./u);
  assert.doesNotMatch(workflow, /secrets\s*\[/u);
  assert.doesNotMatch(workflow, /toJSON\(\s*secrets/u);
  assert.doesNotMatch(workflow, /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|CF_API_TOKEN/u);
  assert.doesNotMatch(workflow, /cf deploy|wrangler deploy|api\.cloudflare\.com/u);
  assert.match(workflow, /persist-credentials: false/u);
  for (const line of lines.filter((line) => /persist-credentials/u.test(line))) {
    assert.match(line, /persist-credentials: false/u);
  }
});

test('the build env is exactly the public variables, from vars', () => {
  const names = [
    ...workflow.matchAll(/^ {6}(NEXT_PUBLIC_[A-Z0-9_]+): \$\{\{ vars\.([A-Z0-9_]+) \}\}$/gmu),
  ];
  assert.deepEqual(
    names.map((match) => match[1]).sort(),
    [...PUBLIC_BUILD_ENV].sort()
  );
  for (const match of names) assert.equal(match[1], match[2]);
  assert.match(workflow, /^ {4}environment: web-vinext-build$/mu);
  assert.match(workflow, /web-vinext-seal\.mjs env-guard/u);
});

test('actions are pinned to full commit SHAs', () => {
  const uses = [...workflow.matchAll(/^\s+(?:- )?uses: (\S+)/gmu)].map(
    (match) => match[1]
  );
  assert.ok(uses.length > 0);
  for (const target of uses) {
    if (target.startsWith('./')) continue;
    assert.match(target, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u, target);
  }
});

test('the pin is validated and checked out exactly', () => {
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/u);
  assert.match(workflow, /git merge-base --is-ancestor "\$SHA" origin\/main/u);
  assert.match(workflow, /git merge-base --is-ancestor "\$SHA" origin\/production/u);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$SHA"/u);
  // Inputs reach shell through env, never by expression interpolation.
  for (const line of lines.filter((line) => /^\s+(?:run: |[^:]*\$\(|echo)/u.test(line))) {
    assert.doesNotMatch(line, /\$\{\{\s*inputs\./u, line);
  }
  assert.match(
    workflow,
    /if: github\.repository == 'tutur3u\/platform' && github\.ref == 'refs\/heads\/main'/u
  );
});

test('artifacts are sealed, verified and kept for a bounded time', () => {
  assert.match(workflow, /web-vinext-seal\.mjs seal /u);
  assert.match(workflow, /web-vinext-sealed-artifact\.mjs \\\n\s+"\$RUNNER_TEMP\/sealed\/\$FAMILY"/u);
  assert.match(workflow, /web-vinext-seal\.mjs receipt /u);
  assert.match(workflow, /web-vinext-sealed-artifact\.mjs --receipt/u);
  const retention = [...workflow.matchAll(/retention-days: (\d+)/gu)].map(
    (match) => Number(match[1])
  );
  assert.equal(retention.length, 2);
  for (const days of retention) assert.ok(days >= 1 && days <= 14);
  assert.match(workflow, /name: web-vinext-sealed-\$\{\{ matrix\.family \}\}/u);
  assert.match(workflow, /name: web-vinext-sealed-receipt/u);
  assert.match(workflow, /^ {4}needs: \[plan, build\]$/mu);
  assert.doesNotMatch(workflow, /if: (?:always|failure|cancelled)\(\)/u);
});
