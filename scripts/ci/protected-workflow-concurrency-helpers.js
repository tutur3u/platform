const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const workflowRoot = path.resolve(__dirname, '../../.github/workflows');
const serialized = [
  'colab-cloudflare.yaml',
  'coordination-cloudflare.yaml',
  'cron-control-cloudflare.yaml',
  'desktop-store-draft.yaml',
  'devbox-control-cloudflare.yaml',
  'discord-modal-deploy.yml',
  'lettin-cloudflare.yaml',
  'meet-cloudflare.yaml',
  'mobile-deploy-stores.yaml',
  'parley-cloudflare.yaml',
  'playground-runtime-acceptance.yaml',
  'production-package-resume.yaml',
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
  'release-realtime-package.yaml',
  'release-sdk-dev.yaml',
  'release-sdk-package.yaml',
  'release-supabase-package.yaml',
  'release-cloudflare-package.yaml',
  'release-types-package.yaml',
  'release-typescript-config-package.yaml',
  'release-ui-package.yaml',
  'release-utils-package.yaml',
  'security-review-reclassify.yaml',
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
// Exceptions retain environment locks, bounded sandbox cleanup, or paused runtimes.
// Cloudflare app workflows are not exceptions: PR validation supersedes and only
// the production-only deploy job holds the serialized lock.
const prExceptions = {
  'playground-runtime-acceptance.yaml':
    'Real sandbox must finish bounded cleanup',
  'docker-setup-check.yaml': 'Docker runtime is paused',
  'rust-backend.yml': 'Rust and TanStack runtimes are paused',
  'security-review-classifier.yaml':
    'Security review check writers serialize per pull request',
};
const mainExceptions = {
  ...prExceptions,
  'turbo-unit-tests.yaml':
    'Every main push retains its own non-cancelling validation result',
  'supabase-staging.yaml':
    'Protected main migrations serialize exact-SHA marker evidence',
  'release-sdk-dev.yaml':
    'Dev publication retains its serial npm dist-tag lock',
  // PR revisions supersede; main never cancels an active staging upload.
  'calendar-cloudflare.yaml':
    'Staging publication consumes the durable attempt ledger',
  'mail-cloudflare.yaml':
    'Staging publication consumes the durable attempt ledger',
  'oxc-check.yaml':
    'Job-level validation and separate repository mutation locks',
  'tanstack-route-manifest.yaml': 'TanStack runtime is paused',
  'codeql.yml':
    'Main-push baselines queue so PR new-alert gates compare against a completed scan',
};
// Main pushes of these workflows queue (one running, newest pending) instead of
// cancelling; every other qualification assertion still applies. Test
// (turbo-unit-tests.yaml) left this set in #8350: first-attempt main pushes now
// supersede, while reruns and dispatch keep immutable slots.
const queuedMainBaselines = new Set(['codeql.yml']);
const workflows = Object.fromEntries(
  fs
    .readdirSync(workflowRoot)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => [file, readWorkflow(file)])
);
function events(workflow) {
  const on = workflow.on;
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on))
    return Object.fromEntries(on.map((event) => [event, null]));
  return on;
}
function context(
  ref,
  sha = 'first',
  run_id = 1,
  event_name = 'push',
  number = 99
) {
  return {
    workflow: 'workflow',
    repository: 'tutur3u/platform',
    ref,
    sha,
    run_id,
    run_attempt: 1,
    event_name,
    head_ref: `fix/pr-${number}`,
    event: {
      workflow_run: {
        id: 7,
        conclusion: 'success',
        event: 'push',
        name: 'Production Deployment Planner',
        head_branch: 'production',
        head_repository: { full_name: 'tutur3u/platform' },
      },
      ...(['pull_request', 'pull_request_target'].includes(event_name)
        ? { pull_request: { number, head: { sha } } }
        : { pull_request: {} }),
    },
  };
}
function expression(source, github) {
  return vm.runInNewContext(
    // GitHub's `labels.*.name` object filter is not JavaScript.
    source.replaceAll('labels.*.name', 'labelNames'),
    {
      github: {
        ...github,
        event: {
          ...github.event,
          pull_request: {
            ...github.event?.pull_request,
            labelNames: (github.event?.pull_request?.labels ?? []).map(
              (label) => label.name
            ),
          },
        },
      },
      inputs: {},
      contains: (items, item) => items.includes(item),
      startsWith: (value, prefix) => value.startsWith(prefix),
      format: (template, ...values) =>
        template.replace(/\{([0-9]+)\}/g, (_, index) => values[index]),
    },
    { timeout: 100 }
  );
}
function render(source, github) {
  if (typeof source !== 'string') return source;
  if (/^\$\{\{.*\}\}$/.test(source) && !source.slice(3, -2).includes('${{')) {
    return expression(source.slice(3, -2), github);
  }
  return source.replace(/\$\{\{(.*?)\}\}/g, (_, code) =>
    expression(code, github)
  );
}
function assertSupersedes(workflow, first, next) {
  const c = workflow.concurrency;
  assert.ok(c && typeof c === 'object', 'missing workflow concurrency');
  assert.equal(
    render(c['cancel-in-progress'], first),
    true,
    'must cancel older validation'
  );
  assert.equal(render(c['cancel-in-progress'], next), true);
  assert.notEqual(c.queue, 'max', 'cancelling workflows cannot use queue: max');
  assert.ok(render(c.group, first), 'group cannot be empty');
  assert.equal(
    render(c.group, first),
    render(c.group, next),
    'SHA/run must not split the group'
  );
  return render(c.group, first);
}
function assertPrSupersedes(workflow, eventName) {
  // Target events use the base ref, including main or production, rather than a merge ref.
  const ref =
    eventName === 'pull_request'
      ? 'refs/pull/99/merge'
      : 'refs/heads/production';
  const first = {
    ...context(ref, 'first', 1, eventName),
    workflow: workflow.name,
  };
  const next = {
    ...context(ref, 'second', 2, eventName),
    workflow: workflow.name,
  };
  const group = assertSupersedes(workflow, first, next);
  assert.notEqual(
    group,
    render(workflow.concurrency.group, {
      ...first,
      head_ref: 'fix/pr-100',
      ref: eventName === 'pull_request' ? 'refs/pull/100/merge' : ref,
      event: { pull_request: { number: 100, head: { sha: 'first' } } },
    }),
    'different PRs must not cancel one another'
  );
  return group;
}

module.exports = {
  serialized,
  prExceptions,
  mainExceptions,
  queuedMainBaselines,
  workflows,
  events,
  context,
  expression,
  render,
  assertSupersedes,
  assertPrSupersedes,
};
