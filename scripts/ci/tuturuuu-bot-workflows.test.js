const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const workflows = readAllWorkflows();
const PIN = 'fee1f7d63c2ff003460e3d139729b119787bc349';
function validate(file, workflow) {
  for (const [id, job] of Object.entries(workflow.jobs || {})) {
    for (const step of job.steps || []) {
      if (!step.uses?.startsWith('actions/create-github-app-token@')) continue;
      assert.equal(
        step.uses,
        `actions/create-github-app-token@${PIN}`,
        `${file}/${id}: pin`
      );
      const events = Object.keys(workflow.on);
      assert.ok(
        events.every((event) =>
          ['push', 'schedule', 'workflow_dispatch'].includes(event)
        ),
        `${file}: trusted triggers`
      );
      assert.match(step.if, /vars.TUTURUUU_BOT_APP_ID != ''/);
      assert.match(step.if, /github.repository == 'tutur3u\/platform'/);
      assert.match(step.if, /github.ref == 'refs\/heads\/(main|production)'/);
      assert.doesNotMatch(
        JSON.stringify(job),
        /github.event.pull_request|github.head_ref/
      );
      for (const checkout of job.steps.filter((s) =>
        s.uses?.startsWith('actions/checkout@')
      )) {
        assert.ok(
          [undefined, 'main', 'production'].includes(checkout.with?.ref),
          'trusted checkout'
        );
      }
      const otherSteps = job.steps.filter((s) => s !== step);
      assert.doesNotMatch(
        JSON.stringify(otherSteps),
        /secrets.TUTURUUU_BOT_PRIVATE_KEY/
      );
      assert.equal(step.with.owner, 'tutur3u');
      assert.equal(step.with.repositories, 'platform');
      assert.equal(step.with['app-id'], `\${{ vars.TUTURUUU_BOT_APP_ID }}`);
      assert.equal(
        step.with['private-key'],
        `\${{ secrets.TUTURUUU_BOT_PRIVATE_KEY }}`
      );
      const scopes = Object.fromEntries(
        Object.entries(step.with).filter(([key]) =>
          key.startsWith('permission-')
        )
      );
      assert.deepEqual(
        scopes,
        file === 'release-please.yaml'
          ? {
              'permission-contents': 'write',
              'permission-issues': 'write',
              'permission-pull-requests': 'write',
            }
          : { 'permission-actions': 'write' }
      );
      assert.notEqual(step.with['skip-token-revoke'], true);
      const consumers = JSON.stringify(job.steps.filter((s) => s !== step));
      assert.match(
        consumers,
        /steps.bot-token.outputs.token \|\| (secrets.RELEASE_PLEASE_TOKEN \|\| )?github.token/
      );
      for (const consumer of job.steps.filter((s) =>
        /approve/i.test(s.name || '')
      )) {
        assert.doesNotMatch(
          JSON.stringify(consumer),
          /bot-token.outputs.token/
        );
      }
    }
  }
}

test('all App jobs are pinned, platform-only, trusted-ref-only, explicitly scoped with fallback', () => {
  let count = 0;
  for (const [file, workflow] of Object.entries(workflows)) {
    validate(file, workflow);
    count += Object.values(workflow.jobs || {}).filter((j) =>
      j.steps?.some((s) => s.id === 'bot-token')
    ).length;
  }
  assert.ok(count >= 3);
  const approval = workflows['release-please.yaml'].jobs[
    'release-please'
  ].steps.find((s) => s.name === 'Approve untouched release PR');
  assert.equal(approval.env.GITHUB_TOKEN, `\${{ github.token }}`);
});

test('policy rejects unpinned actions, fork triggers, broad scope and absent fallback', () => {
  for (const mutation of [
    (_w, s) => {
      s.uses = 'actions/create-github-app-token@v2';
    },
    (w) => {
      w.on.pull_request = {};
    },
    (w) => {
      w.on.pull_request_target = {};
    },
    (_w, s) => {
      s.with['permission-workflows'] = 'write';
    },
    (_w, s) => {
      s.if = 'always()';
    },
    (w) => {
      w.jobs.dispatch.steps.at(-1).env.GH_TOKEN =
        `\${{ steps.bot-token.outputs.token }}`;
    },
  ]) {
    const w = structuredClone(workflows['mobile-testflight-review-queue.yaml']);
    mutation(
      w,
      w.jobs.dispatch.steps.find((s) => s.id === 'bot-token')
    );
    assert.throws(() => validate('mobile-testflight-review-queue.yaml', w));
  }
});

test('private inactive manifest has no review, bypass, workflow or unused check authority', () => {
  const m = JSON.parse(fs.readFileSync('.github/tuturuuu-bot/manifest.json'));
  assert.equal(m.public, false);
  assert.equal(m.hook_attributes.active, false);
  assert.deepEqual(m.default_events, []);
  assert.deepEqual(m.default_permissions, {
    actions: 'write',
    contents: 'write',
    issues: 'write',
    metadata: 'read',
    pull_requests: 'write',
  });
});

test('owner runbook inventory matches current workflow and script sources', () => {
  const { render } = require('./tuturuuu-bot-inventory');
  const doc = fs.readFileSync(
    'apps/docs/build/devops/tuturuuu-bot.mdx',
    'utf8'
  );
  const section = doc
    .split('<!-- bot-inventory:start -->\n')[1]
    .split('\n<!-- bot-inventory:end -->')[0];
  assert.equal(section, render());
});
