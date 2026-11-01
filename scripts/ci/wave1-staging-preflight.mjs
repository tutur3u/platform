// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function preflight({ env, mode, app, fetcher = fetch }) {
  assert.ok(['web', 'native'].includes(mode), 'Unknown preflight mode');
  assert.match(app ?? '', /^[a-z][a-z0-9-]*$/u, 'Invalid app');
  assert.equal(
    env.WAVE1_STAGING_PUBLISH_ENABLED,
    'true',
    'Staging fence refuses publication'
  );
  const admission = env.WAVE1_STAGING_PUBLICATION_ADMISSION;
  assert.ok(
    typeof admission === 'string' && admission.trim(),
    'Missing staging admission'
  );
  // Exact source/artifact admission remains enforced by the existing publishers.
  assert.match(
    env.GITHUB_REPOSITORY ?? '',
    /^[\w.-]+\/[\w.-]+$/u,
    'Invalid repository'
  );
  assert.ok(env.GITHUB_TOKEN, 'Missing GITHUB_TOKEN');
  const names =
    mode === 'web' ? ['wave1-web-staging'] : [`wave1-${app}-staging`];
  async function get(path) {
    const response = await fetcher(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/environments/${path}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      }
    );
    assert.equal(
      response.status,
      200,
      'Environment protection API request failed'
    );
    return response.json();
  }
  for (const name of names) {
    const path = encodeURIComponent(name);
    const environment = await get(path);
    assert.equal(environment.name, name, 'Environment identity mismatch');
    assert.ok(
      environment.protection_rules?.some(
        (rule) =>
          rule.type === 'required_reviewers' &&
          Array.isArray(rule.reviewers) &&
          rule.reviewers.length > 0 &&
          rule.reviewers.every(
            (entry) =>
              ['User', 'Team'].includes(entry.type) &&
              Number.isInteger(entry.reviewer?.id) &&
              entry.reviewer.id > 0
          )
      ),
      'Environment requires reviewers'
    );
    assert.deepEqual(
      environment.deployment_branch_policy,
      {
        protected_branches: false,
        custom_branch_policies: true,
      },
      'Environment must use custom main-only branch policy'
    );
    // Exactly one policy: total_count also rejects rules beyond this page.
    const policies = await get(
      `${path}/deployment-branch-policies?per_page=100`
    );
    assert.equal(policies.total_count, 1, 'Environment must allow only main');
    assert.equal(
      policies.branch_policies?.length,
      1,
      'Incomplete branch policies'
    );
    assert.equal(
      policies.branch_policies[0].name,
      'main',
      'Environment must allow only main'
    );
    assert.equal(
      policies.branch_policies[0].type,
      'branch',
      'Tags must not deploy'
    );
  }
  return names;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  preflight({ env: process.env, mode: process.argv[2], app: process.argv[3] })
    .then((names) =>
      console.log(
        `Protected staging environments verified: ${names.join(', ')}`
      )
    )
    .catch(() => {
      console.error(
        'Staging preflight refused: check repo fences, environment reviewers and main-only branch policies'
      );
      process.exitCode = 1;
    });
}
