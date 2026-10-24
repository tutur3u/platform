const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const workflowRoot = path.resolve(__dirname, '../../.github/workflows');
const serialized = [
  'colab-cloudflare.yaml',
  'coordination-cloudflare.yaml',
  'cron-control-cloudflare.yaml',
  'desktop-beta.yaml',
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
  'release-sdk-dev.yaml',
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
// Exceptions retain environment locks, bounded sandbox cleanup, or paused runtimes.
const prExceptions = {
  'desktop-beta.yaml': 'Production publication shares the workflow lock',
  'colab-cloudflare.yaml': 'Production deployment shares the workflow lock',
  'coordination-cloudflare.yaml':
    'Production deployment shares the workflow lock',
  'cron-control-cloudflare.yaml':
    'Production deployment shares the workflow lock',
  'devbox-control-cloudflare.yaml':
    'Production deployment shares the workflow lock',
  'lettin-cloudflare.yaml': 'Production deployment shares the workflow lock',
  'calendar-cloudflare.yaml':
    'Staging publication consumes the durable attempt ledger',
  'mail-cloudflare.yaml':
    'Staging publication consumes the durable attempt ledger',
  'meet-cloudflare.yaml': 'Production deployment shares the workflow lock',
  'parley-cloudflare.yaml': 'Production deployment shares the workflow lock',
  'playground-runtime-acceptance.yaml':
    'Real sandbox must finish bounded cleanup',
  'docker-setup-check.yaml': 'Docker runtime is paused',
  'rust-backend.yml': 'Rust and TanStack runtimes are paused',
};
const mainExceptions = {
  ...prExceptions,
  'release-sdk-dev.yaml':
    'Dev publication retains its serial npm dist-tag lock',
  'biome-check.yaml':
    'Job-level validation and separate repository mutation locks',
  'tanstack-route-manifest.yaml': 'TanStack runtime is paused',
};
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
const prGroups = new Map();
for (const [file, workflow] of Object.entries(workflows)) {
  for (const event of ['pull_request', 'pull_request_target']) {
    if (!Object.hasOwn(events(workflow), event)) continue;
    test(`${file}: ${event} revisions supersede or have an explicit exception`, () => {
      if (prExceptions[file]) {
        assert.ok(prExceptions[file]);
        if (!file.startsWith('docker-') && file !== 'rust-backend.yml') {
          assert.equal(workflow.concurrency['cancel-in-progress'], false);
          assert.equal(workflow.concurrency.queue, 'max');
        }
        return;
      }
      const group = assertPrSupersedes(workflow, event);
      assert.equal(
        prGroups.has(group),
        false,
        `group collides with ${prGroups.get(group)}`
      );
      prGroups.set(group, file);
      // The same validation policy must also support PR-target events on a base ref.
      if (
        !mainExceptions[file] &&
        workflow.concurrency.group.includes('github.workflow')
      ) {
        assertPrSupersedes(workflow, 'pull_request_target');
      }
    });
  }
  const push = events(workflow).push;
  const onMain =
    Object.hasOwn(events(workflow), 'push') &&
    (!push?.branches || push.branches.includes('main')) &&
    !push?.['branches-ignore']?.includes('main');
  if (onMain && !mainExceptions[file]) {
    test(`${file}: main validation supersedes without sharing a production group`, () => {
      const first = { ...context('refs/heads/main'), workflow: workflow.name };
      const group = assertSupersedes(workflow, first, {
        ...first,
        sha: 'second',
        run_id: 2,
      });
      assert.notEqual(
        group,
        render(workflow.concurrency.group, {
          ...first,
          ref: 'refs/heads/production',
        })
      );
      if (
        Object.hasOwn(events(workflow), 'workflow_dispatch') &&
        file !== 'vercel-preview-platform.yaml'
      ) {
        const manual = { ...first, event_name: 'workflow_dispatch' };
        assert.equal(
          render(workflow.concurrency['cancel-in-progress'], manual),
          false
        );
        assert.notEqual(group, render(workflow.concurrency.group, manual));
      }
    });
  }
}
test('PR exceptions remain explicit and reference existing PR workflows', () => {
  for (const file of Object.keys(prExceptions)) {
    assert.ok(workflows[file], file);
    assert.ok(
      ['pull_request', 'pull_request_target'].some((event) =>
        Object.hasOwn(events(workflows[file]), event)
      ),
      file
    );
  }
});
test('regression controls reject missing, non-cancelling, SHA-specific and cross-PR groups', () => {
  const workflow = workflows['docs-seo-check.yaml'];
  for (const concurrency of [
    undefined,
    { ...workflow.concurrency, 'cancel-in-progress': false },
    {
      ...workflow.concurrency,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      group: '${{ github.workflow }}-${{ github.sha }}',
    },
    {
      ...workflow.concurrency,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      group: '${{ github.workflow }}-${{ github.ref }}',
    },
    { ...workflow.concurrency, queue: 'max' },
  ]) {
    assert.throws(() =>
      assertPrSupersedes({ ...workflow, concurrency }, 'pull_request_target')
    );
  }
});
for (const file of serialized) {
  test(`${file}: expanded queues preserve shared deployment serialization`, () => {
    const c =
      workflows[file].concurrency || workflows[file].jobs.deploy.concurrency;
    assert.equal(c['cancel-in-progress'], false);
    assert.equal(c.queue, 'max');
    // Staging migrations and Cloudflare deploys are dispatched from main.
    const ref =
      file.endsWith('-cloudflare.yaml') ||
      file === 'supabase-staging.yaml' ||
      file === 'release-sdk-dev.yaml'
        ? 'refs/heads/main'
        : 'refs/heads/production';
    const first = context(ref, 'first', 1, 'workflow_dispatch');
    assert.equal(
      render(c.group, first),
      render(c.group, context(ref, 'next', 2, 'workflow_dispatch'))
    );
    assert.equal(
      render(c['cancel-in-progress'], context(ref, 'next', 2, 'push')),
      false
    );
  });
}
test('production validation and generated release evidence retain immutable attempts', () => {
  for (const [file, workflow] of Object.entries(workflows)) {
    const c = workflow.concurrency;
    if (
      !c?.group.includes('github.workflow') ||
      mainExceptions[file] ||
      serialized.includes(file) ||
      file.startsWith('vercel-preview-')
    )
      continue;
    for (const ref of [
      'refs/heads/production',
      'refs/heads/release-please--branches--production--release-notes',
    ]) {
      const first = context(ref);
      assert.equal(render(c['cancel-in-progress'], first), false, file);
      assert.notEqual(
        render(c.group, first),
        render(c.group, { ...first, sha: 'second', run_id: 2 }),
        file
      );
      assert.notEqual(
        render(c.group, first),
        render(c.group, { ...first, run_id: 2 }),
        file
      );
    }
  }
});
test('preview workflows retain latest-run cancellation instead of a conflicting max queue', () => {
  for (const [file, workflow] of Object.entries(workflows)) {
    if (!file.startsWith('vercel-preview-')) continue;
    assert.equal(workflow.concurrency['cancel-in-progress'], true);
    assert.notEqual(workflow.concurrency.queue, 'max');
  }
});

function assertQualification(policy, workflowName) {
  const first = { ...context('refs/heads/main'), workflow: workflowName };
  const later = { ...first, sha: 'later', run_id: 2 };
  const ordinary = render(policy.group, later);
  const qualified = [];
  for (const extra of [
    { run_attempt: 2 },
    { run_attempt: 3 },
    { run_attempt: 2, sha: 'other', run_id: 3 },
    { event_name: 'workflow_dispatch' },
    { event_name: 'workflow_dispatch', sha: 'other', run_id: 3 },
  ]) {
    const candidate = { ...first, ...extra };
    assert.equal(render(policy['cancel-in-progress'], candidate), false);
    const group = render(policy.group, candidate);
    assert.notEqual(
      group,
      ordinary,
      'later pushes cannot cancel qualification'
    );
    assert.notEqual(group, render(policy.group, first));
    qualified.push(group);
  }
  assert.equal(new Set(qualified).size, qualified.length);
  assert.equal(render(policy['cancel-in-progress'], later), true);
}
for (const [file, workflow] of Object.entries(workflows)) {
  const policies = workflow.concurrency
    ? [workflow.concurrency]
    : Object.values(workflow.jobs)
        .map((job) => job.concurrency)
        .filter(Boolean);
  for (const [index, policy] of policies.entries()) {
    if (!policy.group.includes('github.run_attempt')) continue;
    test(`${file} policy ${index}: rerun and dispatch qualify immutable attempts`, () => {
      assertQualification(policy, workflow.name);
    });
  }
}
test('main validation inventory requires isolated qualification, including Biome jobs', () => {
  for (const [file, workflow] of Object.entries(workflows)) {
    if (mainExceptions[file] || file.startsWith('vercel-preview-')) continue;
    if (!Object.hasOwn(events(workflow), 'push')) continue;
    const push = events(workflow).push;
    if (push?.branches && !push.branches.includes('main')) continue;
    if (push?.['branches-ignore']?.includes('main')) continue;
    assertQualification(workflow.concurrency, workflow.name);
  }
});
test('qualification regression controls reject shared groups in either cancellation direction', () => {
  const policy = workflows['type-check.yaml'].concurrency;
  assert.throws(() =>
    assertQualification({ ...policy, group: 'main-latest' }, 'Type Check')
  );
  assert.throws(() =>
    assertQualification({ ...policy, 'cancel-in-progress': true }, 'Type Check')
  );
});
function assertMutationLocks(workflow) {
  assert.equal(
    workflow.concurrency,
    undefined,
    'parent cancellation reaches every job'
  );
  const jobs = Object.entries(workflow.jobs).filter(([, job]) =>
    Object.values(job.permissions || {}).includes('write')
  );
  assert.deepEqual(
    jobs.map(([id]) => id),
    ['apply-format', 'close-outdated-format-pr', 'comment']
  );
  let group;
  for (const [, job] of jobs) {
    assert.equal(job.concurrency['cancel-in-progress'], false);
    assert.equal(job.concurrency.queue, 'max');
    group ||= job.concurrency.group;
    assert.equal(job.concurrency.group, group);
  }
  const validationGroups = new Set();
  for (const id of ['check-ci', 'duplicate-validation', 'format', 'lint']) {
    const job = workflow.jobs[id];
    const first = { ...context('refs/heads/main'), workflow: workflow.name };
    const validationGroup = assertSupersedes(job, first, {
      ...first,
      sha: 'next',
      run_id: 2,
    });
    assert.equal(validationGroups.has(validationGroup), false);
    validationGroups.add(validationGroup);
    assert.notEqual(validationGroup, render(group, first));
    assertQualification(job.concurrency, workflow.name);
  }
}
test('Biome repository writes are outside every cancelling parent and validation group', () => {
  const workflow = workflows['biome-check.yaml'];
  assertMutationLocks(workflow);
  assert.throws(() =>
    assertMutationLocks({
      ...workflow,
      concurrency: workflows['type-check.yaml'].concurrency,
    })
  );
  const unsafe = structuredClone(workflow);
  unsafe.jobs['close-outdated-format-pr'].concurrency['cancel-in-progress'] =
    true;
  assert.throws(() => assertMutationLocks(unsafe));
});
test('workflow_run consumers have an explicit non-cancelling deployment/mutation disposition', () => {
  const jobScoped = { 'discord-modal-deploy.yml': ['deploy'] };
  for (const [file, workflow] of Object.entries(workflows)) {
    const trigger = events(workflow).workflow_run;
    if (!trigger) continue;
    assert.ok(
      serialized.includes(file),
      `${file}: unclassified workflow_run consumer`
    );
    const policies = workflow.concurrency
      ? [workflow.concurrency]
      : (jobScoped[file] || []).map((id) => workflow.jobs[id].concurrency);
    assert.ok(policies.length, file);
    for (const policy of policies) {
      assert.equal(policy['cancel-in-progress'], false, file);
      assert.equal(policy.queue, 'max', file);
      for (const name of trigger.workflows) {
        const producer = Object.values(workflows).find(
          (item) => item.name === name
        );
        assert.ok(producer, name);
        if (!producer.concurrency) continue;
        const cancelled = { ...context('refs/heads/main'), workflow: name };
        const consumer = {
          ...cancelled,
          workflow: workflow.name,
          event_name: 'workflow_run',
        };
        assert.notEqual(
          render(policy.group, consumer),
          render(producer.concurrency.group, cancelled)
        );
      }
    }
  }
});
test('cancelled Discord PR/main completions never enter the active Modal deployment lock', () => {
  const workflow = workflows['discord-modal-deploy.yml'];
  assert.equal(workflow.concurrency, undefined);
  const deploy = workflow.jobs.deploy;
  // deploy (and its lock) only runs after the trigger job admitted the event.
  assert.equal(deploy.needs, 'trigger');
  assert.equal(deploy.if, "needs.trigger.outputs.trusted == 'true'");
  const admission = workflow.jobs.trigger.if;
  const active = context('refs/heads/main', 'trusted', 1, 'workflow_run');
  active.repository = 'tutur3u/platform';
  Object.assign(active.event.workflow_run, {
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'tutur3u/platform' },
  });
  assert.equal(expression(admission, active), true);
  for (const branch of ['main', 'fix/example']) {
    const cancelled = structuredClone(active);
    cancelled.event.workflow_run = {
      conclusion: 'cancelled',
      head_branch: branch,
    };
    assert.equal(expression(admission, cancelled), false);
  }
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
  assert.equal(deploy.concurrency.queue, 'max');
  assert.equal(
    expression(admission, { ...active, event_name: 'workflow_dispatch' }),
    true
  );
});
