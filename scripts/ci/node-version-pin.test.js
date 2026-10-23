const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  readAllWorkflows,
  workflowsDir,
} = require('./workflow-yaml-test-helper');

const root = path.resolve(__dirname, '../..');
const pin = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim();
// Vercel Functions support Node 24.x/22.x only; build where the function runs.
const VERCEL_COMMAND = /\bvercel\s+(build|deploy|pull)\b/u;
const VERCEL_NODE = 24;
const SAME_COMMIT_REF = `\${{ github.sha }}`;
// Qualifies historical sources whose runtime identity binding requires Node 24.
const NODE_24_EVIDENCE = new Map([
  ['employee-schema-contract.yaml:schema', '24.22.1'],
]);

// Workflows the CI switchboard disables belong to paused runtimes; leave them.
const disabled = new Set(
  [
    ...fs
      .readFileSync(path.join(root, 'tuturuuu.ci.ts'), 'utf8')
      .matchAll(/'([\w.-]+\.ya?ml)': false/gu),
  ].map(([, file]) => file)
);

function setupNodeSteps() {
  const found = [];
  for (const [file, workflow] of Object.entries(readAllWorkflows())) {
    if (disabled.has(file)) continue;
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const steps = job.steps ?? [];
      const vercel = VERCEL_COMMAND.test(
        steps.map((s) => s.run ?? '').join('\n')
      );
      let checkout;
      for (const step of steps) {
        if (step.uses?.startsWith('actions/checkout@'))
          checkout = step.with ?? {};
        if (step.uses?.startsWith('actions/setup-node@'))
          found.push({ id: `${file}:${name}`, checkout, step, vercel });
      }
    }
  }
  return found;
}

test('.node-version is one exact release', () => {
  assert.match(pin, /^\d+\.\d+\.\d+$/u);
  assert.equal(
    fs.readFileSync(path.join(root, '.node-version'), 'utf8'),
    `${pin}\n`
  );
});

test('every setup-node step resolves the repository pin or a recorded exception', () => {
  const steps = setupNodeSteps();
  assert.ok(steps.length > 0);
  for (const { id, checkout, step, vercel } of steps) {
    const file = step.with?.['node-version-file'];
    const version = step.with?.['node-version'];
    if (NODE_24_EVIDENCE.has(id)) {
      assert.equal(String(version), NODE_24_EVIDENCE.get(id), id);
      continue;
    }
    if (vercel) {
      assert.equal(version, VERCEL_NODE, `${id} must match Vercel's runtime`);
      continue;
    }
    if (file !== undefined) {
      // The file must come from the same commit the workflow runs from.
      assert.equal(version, undefined, id);
      const prefix = checkout?.path
        ? `${checkout.path.replace(/\/$/u, '')}/`
        : '';
      assert.equal(file, `${prefix}.node-version`, id);
      assert.ok(checkout, `${id} reads .node-version before checkout`);
      assert.equal(checkout['sparse-checkout'], undefined, id);
      assert.ok(
        checkout.ref === undefined || checkout.ref === SAME_COMMIT_REF,
        `${id} checks out a ref that may predate .node-version`
      );
      continue;
    }
    assert.equal(String(version), pin, `${id} must pin .node-version`);
  }
});

test('runtime assertions in workflows name the repository pin', () => {
  for (const file of fs.readdirSync(workflowsDir)) {
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const [, version] of text.matchAll(
      /test "\$\(node --version\)" = (v[\d.]+)/gu
    ))
      assert.equal(version, `v${pin}`, file);
  }
});
