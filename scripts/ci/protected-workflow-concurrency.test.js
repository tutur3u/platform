const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const workflowRoot = path.resolve(__dirname, '../../.github/workflows');
const serialized = [
  'colab-cloudflare.yaml',
  'coordination-cloudflare.yaml',
  'cron-control-cloudflare.yaml',
  'desktop-beta.yaml',
  'desktop-store-draft.yaml',
  'devbox-control-cloudflare.yaml',
  'lettin-cloudflare.yaml',
  'meet-cloudflare.yaml',
  'mobile-deploy-stores.yaml',
  'parley-cloudflare.yaml',
  'playground-runtime-acceptance.yaml',
  'release-ai-package.yaml',
  'release-apis-package.yaml',
  'release-devbox-package.yaml',
  'release-editor-package.yaml',
  'release-google-package.yaml',
  'release-hooks-package.yaml',
  'release-icons-package.yaml',
  'release-internal-api-package.yaml',
  'release-please-auto-merge.yaml',
  'release-please-transient-retry.yaml',
  'release-please.yaml',
  'release-sdk-package.yaml',
  'release-supabase-package.yaml',
  'release-types-package.yaml',
  'release-typescript-config-package.yaml',
  'release-ui-package.yaml',
  'release-utils-package.yaml',
  'supabase-production.yaml',
  'supabase-staging.yaml',
  'vercel-production-ai.yaml',
  'vercel-production-apps.yaml',
  'vercel-production-calendar.yaml',
  'vercel-production-chat.yaml',
  'vercel-production-cms.yaml',
  'vercel-production-contacts.yaml',
  'vercel-production-drive.yaml',
  'vercel-production-finance.yaml',
  'vercel-production-forms.yaml',
  'vercel-production-git.yaml',
  'vercel-production-infrastructure.yaml',
  'vercel-production-inventory.yaml',
  'vercel-production-learn.yaml',
  'vercel-production-mail.yaml',
  'vercel-production-meet.yaml',
  'vercel-production-mind.yaml',
  'vercel-production-nova.yaml',
  'vercel-production-pay.yaml',
  'vercel-production-platform.yaml',
  'vercel-production-rewise.yaml',
  'vercel-production-shortener.yaml',
  'vercel-production-storefront.yaml',
  'vercel-production-tanstack-web.yaml',
  'vercel-production-tasks.yaml',
  'vercel-production-teach.yaml',
  'vercel-production-tools.yaml',
  'vercel-production-track.yaml',
  'vercel-production.yaml',
];
const validation = [
  'biome-check.yaml',
  'e2e-tests.yaml',
  'external-internal-packages.yaml',
  'i18n-check.yaml',
  'mobile-api-mappings.yaml',
  'mobile-build-android.yaml',
  'mobile-build-ios.yaml',
  'mobile-build-linux.yaml',
  'mobile-build-macos.yaml',
  'mobile-build-windows.yaml',
  'mobile.yaml',
  'supabase-baseline.yaml',
  'tanstack-route-manifest.yaml',
  'turbo-unit-tests.yaml',
  'codecov.yaml',
  'codeql.yml',
  'calendar-generation-contract.yaml',
  'creator-identity-contract.yaml',
  'inventory-offline-contract.yaml',
  'programming-app-builds.yaml',
  'programming-database-contract.yaml',
  'security-egress-contract.yaml',
];

function concurrency(file) {
  const source = fs.readFileSync(path.join(workflowRoot, file), 'utf8');
  const block = source.match(/^concurrency:\n((?:[ \t]+[^\n]*\n)+)/m)?.[1];
  assert.ok(block, `${file}: missing workflow concurrency`);
  return Object.fromEntries(
    [...block.matchAll(/^\s*(group|cancel-in-progress|queue): (.+)$/gm)].map(
      (m) => [m[1], m[2]]
    )
  );
}
function context(ref, sha = 'first', run_id = 1, event_name = 'push') {
  return {
    workflow: 'workflow',
    ref,
    sha,
    run_id,
    event_name,
    event: {
      workflow_run: {
        id: 7,
        conclusion: 'success',
        name: 'Production Deployment Planner',
        head_branch: 'production',
      },
      pull_request: { number: 99 },
    },
  };
}
function expression(source, github) {
  return vm.runInNewContext(
    source,
    {
      github,
      inputs: {},
      startsWith: (value, prefix) => value.startsWith(prefix),
      format: (template, ...values) =>
        template.replace(/\{([0-9]+)\}/g, (_, index) => values[index]),
    },
    { timeout: 100 }
  );
}
function render(source, github) {
  return source.replace(/\$\{\{(.*?)\}\}/g, (_, code) =>
    expression(code, github)
  );
}
for (const file of validation) {
  test(`${file}: protected runs remain independent, PR revisions supersede`, () => {
    const c = concurrency(file);
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/heads/release-please--branches--production--release-notes',
    ]) {
      const first = context(ref);
      assert.equal(
        expression(c['cancel-in-progress'].slice(3, -2), first),
        false
      );
      const group = render(c.group, first);
      assert.notEqual(group, render(c.group, context(ref, 'second')));
      assert.notEqual(group, render(c.group, context(ref, 'first', 2)));
      assert.notEqual(
        group,
        render(c.group, context(ref, 'first', 1, 'workflow_dispatch'))
      );
    }
    const pr = context('refs/pull/99/merge');
    assert.equal(expression(c['cancel-in-progress'].slice(3, -2), pr), true);
    assert.equal(
      render(c.group, pr),
      render(c.group, context(pr.ref, 'next', 2))
    );
    assert.notEqual(
      render(c.group, pr),
      render(c.group, context('refs/pull/100/merge'))
    );
  });
}
for (const file of serialized) {
  test(`${file}: expanded queues preserve shared deployment serialization`, () => {
    const c = concurrency(file);
    assert.equal(c['cancel-in-progress'], 'false');
    assert.equal(c.queue, 'max');
    const ref = file.endsWith('-cloudflare.yaml')
      ? 'refs/heads/main'
      : 'refs/heads/production';
    const first = context(ref, 'first', 1, 'workflow_dispatch');
    assert.equal(
      render(c.group, first),
      render(c.group, context(ref, 'next', 2, 'workflow_dispatch'))
    );
  });
}
test('preview workflows retain latest-run cancellation instead of a conflicting max queue', () => {
  for (const file of fs
    .readdirSync(workflowRoot)
    .filter((f) => f.startsWith('vercel-preview-'))) {
    const c = concurrency(file);
    assert.equal(c['cancel-in-progress'], 'true');
    assert.notEqual(c.queue, 'max');
  }
});
