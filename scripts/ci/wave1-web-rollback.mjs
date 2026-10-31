// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Worker-scoped automatic rollback after a red verify-ingress (Tess R-d).
//
//   node scripts/ci/wave1-web-rollback.mjs <sha>
//
// Restores the staging issuer Worker to the deployment the publisher captured
// before this SHA's upload, using the signed attempt ledger. It makes exactly
// one Cloudflare write (a deployment of the prior versions) and touches
// nothing else: no Access, DNS, domain, ledger or variable change. It
// refuses unless this SHA's version is what is actually serving. If the
// rollback cannot be confirmed, the release owner applies S1/S1b.
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readAttemptRecord } from './wave1-native-attempt.mjs';
import { profileFor } from './wave1-native-profile.mjs';
import { boundedJson, requireRollback } from './wave1-native-publish.mjs';
import { assertStagingIdentity } from './wave1-staging-guard.mjs';

const sameVersions = (a, b) =>
  JSON.stringify(
    [...(a ?? [])].map(({ version_id, percentage }) => ({
      version_id,
      percentage,
    }))
  ) ===
  JSON.stringify(
    [...(b ?? [])].map(({ version_id, percentage }) => ({
      version_id,
      percentage,
    }))
  );

export async function rollbackWeb({ env, sha, fetcher = fetch }) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'Exact source SHA required');
  const token = env.CLOUDFLARE_STAGING_API_TOKEN;
  assert.ok(
    token && !env.CLOUDFLARE_API_TOKEN,
    'Missing or unsafe Cloudflare token'
  );
  const p = profileFor('web', 'staging');
  assert.equal(
    env.CLOUDFLARE_STAGING_ACCOUNT_ID,
    p.accountId,
    'Staging account mismatch'
  );
  // Allowlisted Worker and the one provisioned D1 only, before any API call.
  assertStagingIdentity({
    worker: p.name,
    databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
    env,
  });
  const request = (url, bearer, body) =>
    boundedJson(url, bearer, fetcher, body);
  const account = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}`;
  const ledger = await readAttemptRecord({
    request,
    base: account,
    token,
    databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
    expectedDatabaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
    app: 'web',
    scope: {
      databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
      repository: env.GITHUB_REPOSITORY,
      app: 'web',
      worker: p.name,
      accountId: p.accountId,
    },
  });
  const entry = ledger.entries.find(
    (item) =>
      item.payload.sha === sha && ['uploaded', 'activated'].includes(item.state)
  );
  assert.ok(
    entry?.versionId,
    'No published version for this SHA; nothing to roll back'
  );
  const prior = requireRollback([entry.payload.rollback]);
  const target = prior.versions;
  const mine = [{ version_id: entry.versionId, percentage: 100 }];
  assert.ok(
    !sameVersions(target, mine),
    'The captured rollback is this same version'
  );
  const base = `${account}/workers/scripts/${p.name}/deployments`;
  const active = requireRollback(
    (await request(base, token)).result.deployments
  );
  // Only undo our own publication: never override a later or manual change.
  assert.ok(
    sameVersions(active.versions, mine),
    'This SHA is not what is serving; refusing to roll back'
  );
  const written = await request(base, token, {
    strategy: 'percentage',
    versions: target,
    annotations: {
      'workers/message': `rollback of ${sha} after red verify-ingress`,
    },
  });
  assert.equal(
    written.success,
    true,
    'Rollback deployment refused; apply S1/S1b'
  );
  const after = requireRollback(
    (await request(base, token)).result.deployments
  );
  assert.ok(
    sameVersions(after.versions, target),
    'Rollback not observed; apply S1/S1b'
  );
  return { worker: p.name, restored: target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  rollbackWeb({ env: process.env, sha: process.argv[2] })
    .then(({ worker, restored }) => {
      const line = `Rolled ${worker} back to ${restored.map((v) => `${v.version_id}@${v.percentage}%`).join(', ')}. Release owner: decide on S1/S1b.`;
      console.log(line);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `## Worker rolled back\n\n${line}\n`
        );
    })
    .catch((error) => {
      const line = `Automatic Worker rollback failed: ${error instanceof Error ? error.message : 'unknown'}. Apply S1/S1b now.`;
      console.error(line);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `## Rollback FAILED\n\n${line}\n`
        );
      process.exitCode = 1;
    });
