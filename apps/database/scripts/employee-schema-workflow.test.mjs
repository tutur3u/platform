import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
const workflow = readFileSync(
  new URL('.github/workflows/employee-schema-contract.yaml', root),
  'utf8'
);
const steps = workflow.split(/(?=^ {6}- )/mu);
const namedStep = (name) => {
  const matches = steps.filter((step) =>
    step.startsWith(`      - name: ${name}\n`)
  );
  assert.equal(matches.length, 1, `Expected exactly one ${name} step`);
  return matches[0];
};

test('trusted control checkout stays at the workspace root', () => {
  const checkouts = steps.filter((step) =>
    step.startsWith('      - uses: actions/checkout@v7\n')
  );
  assert.equal(checkouts.length, 2);
  assert.match(checkouts[0], /^ {10}ref: \$\{\{ github.sha \}\}$/mu);
  assert.doesNotMatch(checkouts[0], /^ {10}path:/mu);
  assert.match(checkouts[0], /^ {10}persist-credentials: false$/mu);
  assert.match(checkouts[1], /^ {10}ref: \$\{\{ inputs.source_sha \}\}$/mu);
  assert.match(checkouts[1], /^ {10}path: source$/mu);
  assert.match(checkouts[1], /^ {10}persist-credentials: false$/mu);
});

test('shared setup action and its backoff helper resolve from control root', () => {
  assert.match(
    workflow,
    /^ {6}- uses: \.\/\.github\/actions\/setup-bun-with-retry$/mu
  );
  assert.doesNotMatch(workflow, /(?:\.\/|\.\.\/)control\//u);
  const action = readFileSync(
    new URL('.github/actions/setup-bun-with-retry/action.yml', root),
    'utf8'
  );
  assert.match(action, /run: bash scripts\/ci\/setup-bun-with-backoff\.sh/u);
  assert.ok(
    readFileSync(new URL('scripts/ci/setup-bun-with-backoff.sh', root)).length >
      0
  );
});

test('source dependency install uses the trusted root backoff script', () => {
  const step = namedStep('Install exact source dependencies');
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: bash \.\.\/scripts\/ci\/run-with-backoff\.sh bun install --frozen-lockfile$/mu
  );
});

test('strict receipt tests run from control root', () => {
  const step = namedStep('Verify strict TAP and receipt gates');
  assert.doesNotMatch(step, /working-directory:/u);
  assert.match(
    step,
    /^ {8}run: node --test apps\/database\/scripts\/programming-database-tap.test.mjs apps\/database\/scripts\/employee-schema-tap.test.mjs apps\/database\/scripts\/employee-schema-workflow.test.mjs apps\/database\/scripts\/employee-schema-typegen.test.mjs$/mu
  );
});

test('schema runner uses source cwd and control script', () => {
  const step = namedStep(
    'Apply full isolated schema and qualify 172 rollback assertions'
  );
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract.mjs$/mu
  );
});

test('always cleanup uses the same source cwd and control script', () => {
  const step = namedStep('Stop only this exact owned isolated database');
  assert.match(step, /^ {8}if: always\(\)$/mu);
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract.mjs --cleanup$/mu
  );
});

// Type artifacts belong to the exact disposable-schema receipt, never to selected source.
test('normal qualification uploads generated schema definitions with its receipt', () => {
  assert.match(
    workflow,
    /path: \|\n {12}\$\{\{ runner.temp \}\}\/employee-schema-receipts\/qualification\.json\n {12}\$\{\{ runner.temp \}\}\/employee-schema-receipts\/generated-types\.ts/u
  );
  const controller = readFileSync(
    new URL('apps/database/scripts/verify-employee-schema-contract.mjs', root),
    'utf8'
  );
  assert.match(controller, /typegen: async \(\) =>/u);
  assert.match(controller, /generateEmployeeTypes\(/u);
  assert.match(controller, /consumerQualified: false/u);
  assert.match(
    controller,
    /process.exitCode = receipt.combinedQualified \? 0 : 1/u
  );
  assert.match(
    controller,
    /label=com.supabase.cli.project=\$\{metadata.projectId\}/u
  );
});
