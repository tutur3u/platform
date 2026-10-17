import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
    /^ {8}run: node --test apps\/database\/scripts\/programming-database-tap.test.mjs apps\/database\/scripts\/employee-schema-tap.test.mjs apps\/database\/scripts\/employee-schema-workflow.test.mjs$/mu
  );
});

test('schema runner uses source cwd and control script', () => {
  const step = namedStep(
    'Apply full isolated schema and qualify selected rollback assertions'
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

test('personal journal profile stays optional and is passed to the guarded runner', () => {
  assert.match(
    workflow,
    /include_personal_journal:\n(?:[^\n]*\n)*? {8}default: false\n {8}type: boolean/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL: \$\{\{ inputs.include_personal_journal \}\}/u
  );
});

test('combined profiles reject incompatible selections before hosted database setup', () => {
  for (let bits = 0; bits < 64; bits++) {
    const journal = Boolean(bits & 1);
    const personal = Boolean(bits & 2);
    const http = Boolean(bits & 4);
    const restore = Boolean(bits & 8);
    const webSession = Boolean(bits & 16);
    const addressMigration = Boolean(bits & 32);
    const result = spawnSync(
      process.execPath,
      [
        new URL(
          'apps/database/scripts/verify-employee-schema-contract.mjs',
          root
        ).pathname,
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_JOURNAL: String(journal),
          EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL: String(personal),
          EMPLOYEE_SCHEMA_INCLUDE_HTTP: String(http),
          EMPLOYEE_SCHEMA_INCLUDE_RESTORE: String(restore),
          EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION: String(webSession),
          EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: String(addressMigration),
          EMPLOYEE_SCHEMA_SOURCE_SHA: '1'.repeat(40),
        },
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    const expected =
      http && !journal
        ? /HTTP qualification requires the journal qualification/u
        : webSession && !http
          ? /Web session qualification requires HTTP qualification/u
          : restore && !http
            ? /RESTORE qualification requires HTTP qualification/u
            : personal && (journal || addressMigration)
              ? /Select one optional schema profile/u
              : /This gate requires a disposable hosted Linux runner/u;
    assert.match(result.stderr, expected, `profile bits ${bits}`);
  }
});

test('migration and RESTORE selections retain separate inputs and environment bindings', () => {
  const blocks = workflow.split(/(?=^ {6}[a-z_]+:\n)/mu);
  for (const [input, variable] of [
    ['include_journal', 'EMPLOYEE_SCHEMA_INCLUDE_JOURNAL'],
    ['include_http', 'EMPLOYEE_SCHEMA_INCLUDE_HTTP'],
    ['include_restore', 'EMPLOYEE_SCHEMA_INCLUDE_RESTORE'],
    ['include_web_session', 'EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION'],
    ['include_address_migration', 'EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION'],
  ]) {
    const selected = blocks.filter((block) =>
      block.startsWith(`      ${input}:\n`)
    );
    assert.equal(selected.length, 1);
    for (const line of ['required: false', 'default: false', 'type: boolean'])
      assert.match(selected[0], new RegExp(`^ {8}${line}$`, 'mu'));
    assert.equal(
      workflow.split(`      ${variable}: \${{ inputs.${input} }}\n`).length - 1,
      1
    );
  }
  const step = namedStep('Type-check selected HTTP fixtures without builds');
  assert.match(step, /^ {8}if: inputs.include_http == true$/mu);
  assert.match(step, /tsconfig.employee-http.json --noEmit/u);
});
