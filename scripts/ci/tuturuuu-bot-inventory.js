const fs = require('node:fs');
const path = require('node:path');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const ROOT = path.resolve(__dirname, '../..');
const RESERVED =
  /^(discord-modal-deploy|supabase-staging|supabase-production|production-package-resume|release-please-transient-retry|security-checks|security-review-classifier)\./;
const SIGNAL =
  /(?:\bgh\b|TOKEN|\bPAT\b|workflow_dispatch|release-please|createComment|updateComment|auto.?merge)/i;
function inventory() {
  const rows = [];
  for (const [file, workflow] of Object.entries(readAllWorkflows())) {
    const text = fs.readFileSync(
      path.join(ROOT, '.github/workflows', file),
      'utf8'
    );
    if (!SIGNAL.test(text) && !/: write/.test(text)) continue;
    const migrated = Object.entries(workflow.jobs || {}).flatMap(
      ([id, job]) => {
        const mint = (job.steps || []).find((s) =>
          s.uses?.startsWith('actions/create-github-app-token@')
        );
        if (!mint) return [];
        const scopes = Object.entries(mint.with)
          .filter(([key]) => key.startsWith('permission-'))
          .map(([key, level]) => `${key.slice(11)}=${level}`)
          .join(', ');
        return [`${id}: ${scopes}`];
      }
    );
    let decision = 'b: keep GITHUB_TOKEN';
    let reason =
      'No explicit GitHub write scope; retain the current job/default token. External service secrets are not GitHub identities.';
    if (RESERVED.test(file)) {
      decision = 'b: follow-up';
      reason =
        'Reserved by #6459/#6456 or the owning release lane; no edits here.';
    } else if (migrated.length) {
      decision = 'a: App + existing fallback';
      reason =
        migrated.join('; ') +
        '. Other jobs retain job-bound read/OIDC/lifecycle tokens.';
    } else if (
      ['release-please.yaml', 'release-please-auto-merge.yaml'].includes(file)
    ) {
      decision = 'b: retain current PAT/GITHUB_TOKEN';
      reason =
        'Release automation retains RELEASE_PLEASE_TOKEN/GITHUB_TOKEN, including workflow-scoped PAT writes. The local agent App is a separate identity and has no bypass.';
    } else if (
      /pull_request/.test(JSON.stringify(workflow.on || {})) ||
      file === 'biome-check.yaml'
    ) {
      reason =
        'Fork/branch-code boundary: no App key in this workflow. Keep existing job permissions and triggers.';
    } else if (/: write/.test(text)) {
      reason =
        'Job-bound deployment, OIDC, package/attestation, security or Actions lifecycle capability; outside this App identity scope.';
    }
    const permissions = [
      ...new Set(
        Object.values(workflow.jobs || {})
          .map((j) =>
            Object.entries(j.permissions || workflow.permissions || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')
          )
          .filter(Boolean)
      ),
    ];
    rows.push(
      `| \`${file}\` | ${decision} | ${reason} Current job scopes: ${permissions.join('; ') || 'inherited repository default (not inferred)'}. |`
    );
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'tmp', '__pycache__'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (
        !/\.(?:[cm]?[jt]s|sh|py)$/.test(entry.name) ||
        /\.test\.|\.runtime\.|tuturuuu-bot-inventory/.test(entry.name)
      )
        continue;
      const text = fs.readFileSync(full, 'utf8');
      if (!SIGNAL.test(text)) continue;
      const relative = path.relative(ROOT, full);
      let reason =
        'b: service credential or validation reference; retain the existing caller/job token. No new GitHub write identity.';
      if (/tuturuuu-bot-token/.test(relative))
        reason =
          'a: Keychain wrapper; explicit platform-only scopes, ephemeral child environment.';
      else if (
        /normalize-release-description|release-please-overflow-recovery/.test(
          relative
        )
      )
        reason =
          'b: release caller retains its existing release identity and PAT/GITHUB_TOKEN. No App migration.';
      else if (/release-please-auto-approve/.test(relative))
        reason =
          'b: approval identity remains GITHUB_TOKEN; never pass the App token.';
      else if (/resume-production-package/.test(relative))
        reason = 'b: reserved follow-up with production-package-resume.';
      else if (
        /github-deployment-markers|record-deployment-marker|record-vercel-deployment/.test(
          relative
        )
      )
        reason =
          'b: job-bound deployments write; App deliberately has no deployment authority.';
      else if (
        /git-release-please|git-sync|git-workflow|sync-platform-release-version/.test(
          relative
        )
      )
        reason =
          'b: protected-branch/workflow sync retains owner credentials; App has no bypass or workflow permission.';
      else if (/watch-blue-green/.test(relative))
        reason =
          'b: existing scoped broker or explicit caller credential for read-only deployment observation; no App key in this observer.';
      else if (/GH_TOKEN|GITHUB_TOKEN|\bgh\b/.test(text))
        reason =
          'b: retain job-bound/caller credential for reads and existing gates; local authorized feature-branch writes use the bot wrapper. No embedded PAT.';
      rows.push(`| \`${relative}\` | ${reason} |`);
    }
  }
  rows.push('\n### Scripts\n\n| Script | Decision and scope |\n| --- | --- |');
  walk(path.join(ROOT, 'scripts'));
  return rows.join('\n');
}
function render() {
  return (
    '| Workflow | Decision | Scope and reason |\n| --- | --- | --- |\n' +
    inventory()
  );
}
module.exports = { render, RESERVED };
if (require.main === module) process.stdout.write(`${render()}\n`);
