const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function readWorkflow(name) {
  return JSON.parse(
    execFileSync(
      'ruby',
      [
        '-e',
        "require 'yaml'; require 'json'; data = YAML.load_file(ARGV.fetch(0)); data['on'] = data.delete(true) if data.key?(true); puts JSON.generate(data)",
        path.resolve(__dirname, '../../.github/workflows', name),
      ],
      { encoding: 'utf8' }
    )
  );
}

const ci = readWorkflow('discord-python-ci.yml');
const modal = readWorkflow('discord-modal-deploy.yml');

test('Python jobs pin immutable installers and preserve locked cache inputs', () => {
  let installerCount = 0;
  for (const job of Object.values(ci.jobs)) {
    const installer = job.steps?.find((step) =>
      step.uses?.startsWith('astral-sh/setup-uv@')
    );
    if (!installer) continue;
    installerCount += 1;
    assert.match(installer.uses, /^astral-sh\/setup-uv@[0-9a-f]{40}$/);
    assert.equal(installer.with['enable-cache'], true);
    assert.equal(installer.with['prune-cache'], true);
    assert.equal(
      installer.with['cache-dependency-glob'],
      'apps/discord/uv.lock'
    );
    assert.equal(job.defaults.run['working-directory'], './apps/discord');
    assert.ok(job.steps.some((step) => step.run === 'uv sync --locked'));
  }
  assert.equal(installerCount, 7);
});

test('workflow-run deployment uses automatic cache protection', () => {
  assert.deepEqual(modal.on.workflow_run.types, ['completed']);
  const installer = modal.jobs.deploy.steps.find((step) =>
    step.uses?.startsWith('astral-sh/setup-uv@')
  );
  assert.match(installer.uses, /^astral-sh\/setup-uv@[0-9a-f]{40}$/);
  assert.equal(installer.with['enable-cache'], 'auto');
  assert.equal(installer.with['prune-cache'], true);
  assert.equal(installer.with['cache-dependency-glob'], 'apps/discord/uv.lock');
});

test('Modal deployment retains trusted main completion and exact checkout', () => {
  assert.deepEqual(modal.permissions, { contents: 'read' });
  assert.deepEqual(modal.on.workflow_run.workflows, ['Discord Python CI']);
  assert.match(modal.jobs.deploy.if, /workflow_run\.conclusion == 'success'/);
  assert.match(modal.jobs.deploy.if, /workflow_run\.head_branch == 'main'/);
  const checkout = modal.jobs.deploy.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.match(
    checkout.with.ref,
    /^\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}$/
  );
  assert.ok(
    modal.jobs.deploy.steps.some((step) => step.run === 'uv sync --locked')
  );
});
