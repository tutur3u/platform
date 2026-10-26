// Hosted PR CI admission: heavy pull_request jobs run only on PRs labelled
// ready-for-ci. Push, schedule and manual events are never gated.
const READY_LABEL = 'ready-for-ci';

const PR_LABEL_GATE = `github.event_name != 'pull_request' || (contains(github.event.pull_request.labels.*.name, '${READY_LABEL}') && (github.event.action != 'labeled' || github.event.label.name == '${READY_LABEL}'))`;

// Unrelated label events land in their own group so they cannot cancel an
// admitted run and replace it with an all-skipped one.
const LABEL_EVENT_GROUP_SUFFIX = `\${{ github.event.action == 'labeled' && github.event.label.name != '${READY_LABEL}' && format('-label-{0}', github.run_id) || '' }}`;

// Branch-push validators moved their non-protected pushes to the gated
// pull_request trigger; protected and generated refs keep push validation.
const PROTECTED_PUSH_BRANCHES = [
  'main',
  'production',
  'release-please--branches--**',
];
const PUSH_TO_PR = {
  'biome-check.yaml': PROTECTED_PUSH_BRANCHES,
  'discord-python-ci.yml': PROTECTED_PUSH_BRANCHES,
  'supabase-baseline.yaml': ['main', 'release-please--branches--**'],
  'turbo-unit-tests.yaml': PROTECTED_PUSH_BRANCHES,
  'type-check.yaml': PROTECTED_PUSH_BRANCHES,
};

const HEAVY_PR_WORKFLOWS = [
  'ai-cloudflare.yaml',
  'api-worker.yaml',
  'apps-cloudflare.yaml',
  'biome-check.yaml',
  'calendar-cloudflare.yaml',
  'calendar-generation-contract.yaml',
  'cms-cloudflare.yaml',
  'codeql.yml',
  'colab-cloudflare.yaml',
  'connected-mail-accounts-contract.yaml',
  'coordination-cloudflare.yaml',
  'creator-identity-contract.yaml',
  'cron-control-cloudflare.yaml',
  'desktop-beta.yaml',
  'devbox-control-cloudflare.yaml',
  'discord-python-ci.yml',
  'docs-seo-check.yaml',
  'external-internal-packages.yaml',
  'external-project-storage-analytics-contract.yaml',
  'finance-cloudflare.yaml',
  'forms-cloudflare.yaml',
  'i18n-check.yaml',
  'inventory-cloudflare.yaml',
  'inventory-offline-contract.yaml',
  'lettin-cloudflare.yaml',
  'mail-calendar-tasks-builds.yaml',
  'mail-cloudflare.yaml',
  'mail-profile-runtime-contract.yaml',
  'meet-cloudflare.yaml',
  'mobile-build-android.yaml',
  'mobile-build-ios.yaml',
  'mobile-build-linux.yaml',
  'mobile-build-macos.yaml',
  'mobile-build-windows.yaml',
  'mobile.yaml',
  'nova-cloudflare.yaml',
  'parley-cloudflare.yaml',
  'periodic-report-delivery-contract.yaml',
  'playground-runtime-acceptance.yaml',
  'programming-app-builds.yaml',
  'programming-database-contract.yaml',
  'report-review-receipts-contract.yaml',
  'sdk-package-qualification.yaml',
  'security-egress-contract.yaml',
  'shortener-cloudflare.yaml',
  'sso-persistence-contract.yaml',
  'storefront-cloudflare.yaml',
  'supabase-baseline.yaml',
  'time-tracker-control-contract.yaml',
  'topic-delivery-foundation-contract.yaml',
  'track-cloudflare.yaml',
  'tsrs-shadow.yaml',
  'turbo-cache-cloudflare.yaml',
  'turbo-unit-tests.yaml',
  'tutoring-absence-credit-contract.yaml',
  'tutoring-teacher-hours-contract.yaml',
  'type-check.yaml',
];

// Sub-minute, script-only or security checks that stay on for every PR push.
const ALWAYS_ON_PR_WORKFLOWS = [
  'branch-name-check.yaml',
  'check-migration-timestamps.yml',
  'check-migrations.yml',
  'codex-plugin.yaml',
  'mobile-api-mappings.yaml',
  'security-checks.yaml',
  'security-review-classifier.yaml',
];

// Paused runtimes keep their retained policy and are neither gated nor run.
const PAUSED_PR_WORKFLOWS = [
  'docker-setup-check.yaml',
  'e2e-tests.yaml',
  'rust-backend.yml',
  'tanstack-route-manifest.yaml',
];

// Digest of every non-PR trigger. Converted workflows drop only the push
// branch selector, so their paths and other triggers must stay identical.
function protectedTriggerDigest(file, on) {
  const triggers = {};
  for (const key of [
    'push',
    'workflow_dispatch',
    'schedule',
    'workflow_call',
    'release',
    'workflow_run',
  ]) {
    if (!on || !Object.hasOwn(on, key)) continue;
    let value = on[key] ?? null;
    if (key === 'push' && PUSH_TO_PR[file] && value) {
      const rest = Object.entries(value).filter(
        ([name]) => name !== 'branches' && name !== 'branches-ignore'
      );
      value = rest.length ? Object.fromEntries(rest) : null;
    }
    triggers[key] = value;
  }
  return require('node:crypto')
    .createHash('sha256')
    .update(JSON.stringify(triggers))
    .digest('hex')
    .slice(0, 16);
}

module.exports = {
  ALWAYS_ON_PR_WORKFLOWS,
  HEAVY_PR_WORKFLOWS,
  LABEL_EVENT_GROUP_SUFFIX,
  PAUSED_PR_WORKFLOWS,
  PR_LABEL_GATE,
  protectedTriggerDigest,
  PROTECTED_PUSH_BRANCHES,
  PUSH_TO_PR,
  READY_LABEL,
};
