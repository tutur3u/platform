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
    step.startsWith('      - uses: actions/checkout@')
  );
  assert.equal(checkouts.length, 2);
  assert.match(checkouts[0], /^ {10}ref: \$\{\{ github.sha \}\}$/mu);
  assert.doesNotMatch(checkouts[0], /^ {10}path:/mu);
  assert.match(checkouts[0], /^ {10}persist-credentials: false$/mu);
  // The source is the dispatched commit itself: no dispatch input selects code
  // to run in the ref's cache scope (CodeQL actions/cache-poisoning).
  assert.match(checkouts[1], /^ {10}ref: \$\{\{ github.sha \}\}$/mu);
  assert.doesNotMatch(steps.join('\n'), /ref: \$\{\{ inputs\./u);
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
    /^ {8}run: node --test apps\/database\/scripts\/employee-managed-profile-qualification.test.mjs apps\/database\/scripts\/programming-database-tap.test.mjs apps\/database\/scripts\/employee-schema-tap.test.mjs apps\/database\/scripts\/employee-retained-mailbox-schema.test.mjs apps\/database\/scripts\/employee-schema-workflow.test.mjs$/mu
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
          EMPLOYEE_SCHEMA_INCLUDE_CHAT_INITIAL_SETTINGS: 'false',
          EMPLOYEE_SCHEMA_DIAGNOSE_CHAT_PROCESS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_STRUCTURED_PROVENANCE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_JOURNAL: String(journal),
          EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL: String(personal),
          EMPLOYEE_SCHEMA_INCLUDE_HTTP: String(http),
          EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_PROFILE_ROUTE: 'false',
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

test('employee public consumer proof stays default-off and uses the maintained qualification gate', () => {
  assert.match(
    workflow,
    /include_public_consumer:\n(?:[^\n]*\n)*? {8}default: false\n {8}type: boolean/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_PUBLIC_CONSUMER: \$\{\{ inputs.include_public_consumer \}\}/u
  );
  const preflight = namedStep('Validate employee public consumer selection');
  assert.match(preflight, /if: inputs.include_public_consumer == true/u);
  assert.ok(
    workflow.indexOf(preflight) <
      workflow.indexOf(namedStep('Install exact source dependencies'))
  );
  const step = namedStep('Verify employee public consumer proof gates');
  assert.doesNotMatch(step, /working-directory:/u);
  assert.match(
    step,
    /node --test scripts\/employee-public-consumer-qualification.test.mjs/u
  );
  const runner = readFileSync(
    new URL('apps/database/scripts/verify-employee-schema-contract.mjs', root),
    'utf8'
  );
  assert.match(runner, /await runSchemaTypegen\(/u);
  const typegen = readFileSync(
    new URL('apps/database/scripts/employee-schema-typegen.mjs', root),
    'utf8'
  );
  assert.ok(
    typegen.indexOf('generatedTypesSha256 = generateEmployeeTypes(') <
      typegen.indexOf('publicConsumerState = await runEmployeePublicConsumer(')
  );
  assert.match(
    runner,
    /!publicConsumer \|\| receipt.employeePublicConsumer.sourceCompilerQualified/u
  );
});

test('Google destination source packet count is checked only for the selected migration profile', () => {
  const step = namedStep('Verify Google destination packet source');
  assert.match(step, /if: inputs.include_address_migration == true/u);
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /run: node --test apps\/database\/scripts\/employee-google-destination-fixture.test.mjs/u
  );
});

test('Google provider stays separately default-off with bound prepare, execution, finalization and artifact', () => {
  assert.ok(
    /include_google_destination_provider:\n.*\n {8}required: false\n {8}default: false\n {8}type: boolean/u.test(
      workflow
    ),
    'Google provider input must remain optional and default false'
  );
  const fixtureTypes = namedStep(
    'Type check Google provider fixtures without builds'
  );
  assert.match(
    fixtureTypes,
    /if: inputs.include_google_destination_provider == true/u
  );
  assert.match(fixtureTypes, /tsconfig.provider.json --noEmit/u);
  const fixtureUnit = namedStep(
    'Verify Google provider preservation and cleanup assertions'
  );
  assert.match(
    fixtureUnit,
    /if: inputs.include_google_destination_provider == true/u
  );
  assert.match(fixtureUnit, /working-directory: source/u);
  assert.match(
    fixtureUnit,
    /vitest.provider.config.mts --maxWorkers=1 --no-file-parallelism/u
  );
  const gates = namedStep('Verify optional Google provider receipt gates');
  assert.match(
    gates,
    /if: inputs.include_google_destination_provider == true/u
  );
  assert.match(
    gates,
    /node --test apps\/database\/scripts\/employee-google-provider-ci.test.mjs/u
  );
  for (const [name, suffix] of [
    ['Bind optional Google provider qualification', ' --prepare'],
    ['Qualify optional Google destination provider', ''],
    ['Finalize optional Google provider receipt', ' --finalize'],
  ]) {
    const step = namedStep(name);
    assert.match(step, /working-directory: source/u);
    assert.ok(
      step.includes(
        `run: node --experimental-strip-types ../apps/database/scripts/employee-google-provider-ci.mjs${suffix}\n`
      )
    );
  }
  assert.match(
    namedStep('Finalize optional Google provider receipt'),
    /if: always\(\) && inputs.include_google_destination_provider == true/u
  );
  assert.match(workflow, /employee-schema-receipts\/google-provider.json/u);
});

const dependencyContracts = [
  [
    'Verify optional Google provider receipt gates',
    'include_google_destination_provider',
    'apps/database/scripts/employee-google-provider-ci.test.mjs',
  ],
  [
    'Verify Google destination packet source',
    'include_address_migration',
    'apps/database/scripts/employee-google-destination-fixture.test.mjs',
  ],
];
function assertInstalledContracts(text, profile) {
  const blocks = text.split(/(?=^ {6}- )/mu);
  const install = blocks.findIndex((step) =>
    step.startsWith('      - name: Install exact source dependencies\n')
  );
  assert.ok(install >= 0);
  for (const [name, flag, file] of dependencyContracts) {
    if (!profile[flag]) continue;
    const matches = blocks.filter((step) =>
      step.startsWith(`      - name: ${name}\n`)
    );
    assert.equal(matches.length, 1);
    const step = matches[0];
    assert.ok(
      blocks.indexOf(step) > install,
      `${name} requires installed source`
    );
    assert.match(step, /^ {8}working-directory: source$/mu);
    assert.ok(step.includes(`        if: inputs.${flag} == true\n`));
    assert.ok(step.includes(`        run: node --test ${file}\n`));
  }
}
for (const provider of [false, true]) {
  test(`all selected dependency-bearing contracts use installed source (address=true/provider=${provider})`, () => {
    assertInstalledContracts(workflow, {
      include_address_migration: true,
      include_google_destination_provider: provider,
    });
  });
}
for (const [name] of dependencyContracts) {
  test(`${name} cannot silently fall back to control checkout or precede install`, () => {
    const step = namedStep(name);
    const profile = {
      include_address_migration: true,
      include_google_destination_provider: true,
    };
    assert.throws(() =>
      assertInstalledContracts(
        workflow.replace(
          step,
          step.replace('        working-directory: source\n', '')
        ),
        profile
      )
    );
    const install = namedStep('Install exact source dependencies');
    assert.throws(() =>
      assertInstalledContracts(
        workflow.replace(step, '').replace(install, step + install),
        profile
      )
    );
  });
}
test('qualification Node test census keeps builtin controls separate from the two installed-source closures', () => {
  const tests = steps.filter((step) =>
    /^ {8}run: node --test(?: |$)/mu.test(step)
  );
  const names = tests.map((step) => /^ {6}- name: (.+)$/mu.exec(step)?.[1]);
  assert.deepEqual(
    names.sort(),
    [
      ...dependencyContracts.map(([name]) => name),
      'Verify opt-in chat qualification contracts',
      'Verify authenticated profile route receipt gates',
      'Verify strict TAP and receipt gates',
      'Verify employee public consumer proof gates',
      'Verify feedback profile gates',
      'Verify feedback causal protocol gates',
      'Verify HTTP qualification receipt gates',
      'Verify Web request session receipt gates',
      'Verify diagnostic-only provenance parser',
    ].sort()
  );
  for (const step of tests) {
    if (
      dependencyContracts.some(([name]) =>
        step.startsWith(`      - name: ${name}\n`)
      )
    )
      continue;
    assert.doesNotMatch(step, /working-directory:/u);
  }
});
test('every profile requires source and control to be the same published H', () => {
  const step = namedStep('Validate exact source selection');
  const script = /^ {8}run: node -e '(.+)'$/mu.exec(step)?.[1];
  assert.ok(script);
  // Matching source/control passes in the address test below; a mismatch
  // fails even without the address profile.
  const result = spawnSync(process.execPath, ['-e', script], {
    env: {
      ...process.env,
      EMPLOYEE_SCHEMA_SOURCE_SHA: 'a'.repeat(40),
      EMPLOYEE_SCHEMA_CONTROL_SHA: 'b'.repeat(40),
      EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: 'false',
    },
  });
  assert.equal(result.status, 1);
});

test('address-only and provider profiles require source and control to be the same published H', () => {
  const step = namedStep('Validate exact source selection');
  const script = /^ {8}run: node -e '(.+)'$/mu.exec(step)?.[1];
  assert.ok(script);
  const source = 'a'.repeat(40);
  const control = 'b'.repeat(40);
  for (const provider of ['false', 'true']) {
    for (const matching of [false, true]) {
      const result = spawnSync(process.execPath, ['-e', script], {
        env: {
          ...process.env,
          EMPLOYEE_SCHEMA_SOURCE_SHA: source,
          EMPLOYEE_SCHEMA_CONTROL_SHA: matching ? source : control,
          EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: 'true',
          EMPLOYEE_SCHEMA_INCLUDE_GOOGLE_DESTINATION_PROVIDER: provider,
        },
      });
      assert.equal(result.status, matching ? 0 : 1);
    }
  }
});

test('installed rejection proof files belong to the nearest fixture tsconfig instead of control solution references', () => {
  const config = JSON.parse(
    readFileSync(new URL('apps/web/e2e/fixtures/tsconfig.json', root), 'utf8')
  );
  assert.ok(config.include.includes('employee-rejection-http-proof*.ts'));
  assert.equal(config.extends, '../../tsconfig.json');
});

test('authenticated profile PATCH is optional and owns its separate source compiler and receipt gate', () => {
  assert.match(
    workflow,
    /include_profile_route:\n(?:[^\n]*\n)*? {8}default: false\n {8}type: boolean/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_PROFILE_ROUTE: \$\{\{ inputs.include_profile_route \}\}/u
  );
  const selection = namedStep('Validate authenticated profile route selection');
  assert.match(selection, /selectProfileRouteRuntime/u);
  assert.doesNotMatch(selection, /WEB_SESSION/u);
  assert.ok(
    workflow.indexOf(selection) <
      workflow.indexOf(namedStep('Install exact source dependencies'))
  );
  const compiler = namedStep(
    'Typecheck authenticated Infrastructure profile fixture'
  );
  assert.match(compiler, /^ {8}if: inputs.include_profile_route == true$/mu);
  assert.match(compiler, /^ {8}working-directory: source$/mu);
  assert.match(
    compiler,
    /tsc --noEmit -p apps\/infrastructure\/e2e\/fixtures\/tsconfig.employee-profile-route.json/u
  );
  const gate = namedStep('Verify authenticated profile route receipt gates');
  assert.doesNotMatch(gate, /working-directory:/u);
  assert.match(
    gate,
    /node --test apps\/database\/scripts\/employee-profile-route-receipt.test.mjs/u
  );
});
