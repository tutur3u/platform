const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  containmentErrors,
  configFiles,
} = require('./check-meet-ai-containment');
test('every checked-in Meet deploy config retains SR-919 pins', () => {
  for (const file of configFiles())
    assert.deepEqual(
      containmentErrors(readFileSync(file, 'utf8'), file),
      [],
      file
    );
});
const required = {
  required: [
    'MEET_AI_DISABLED_WORKSPACE_IDS',
    'MEET_AI_PROTECTED_WORKSPACE_IDS',
  ],
};
test('the lifted kill switch accepts exactly "false" with every other pin', () => {
  assert.deepEqual(
    containmentErrors(
      JSON.stringify({
        vars: { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '' },
        secrets: required,
      }),
      'meet.jsonc',
      false
    ),
    []
  );
  for (const MEET_AI_DISABLED of ['0', 'FALSE', '', ' false', undefined])
    assert.ok(
      containmentErrors(
        JSON.stringify({
          vars: { MEET_AI_DISABLED, MEET_AI_ENABLED_WORKSPACE_IDS: '' },
          secrets: required,
        }),
        'meet.jsonc',
        false
      ).length,
      String(MEET_AI_DISABLED)
    );
});
test('containment in force still requires the kill switch', () => {
  assert.ok(
    containmentErrors(
      JSON.stringify({
        vars: { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '' },
        secrets: required,
      }),
      'meet.jsonc',
      true
    ).length
  );
});
for (const vars of [
  {},
  { MEET_AI_DISABLED: true, MEET_AI_ENABLED_WORKSPACE_IDS: '' },
  { MEET_AI_DISABLED: 'true', MEET_AI_ENABLED_WORKSPACE_IDS: '*' },
  {
    MEET_AI_DISABLED: 'true',
    MEET_AI_ENABLED_WORKSPACE_IDS: '',
    MEET_AI_ALL_WORKSPACES: 'reviewed-allow-all-2026-11-20',
  },
  {
    MEET_AI_DISABLED: 'true',
    MEET_AI_ENABLED_WORKSPACE_IDS: '',
    MEET_AI_ALL_WORKSPACES: '',
  },
]) {
  test(`rejects containment regression ${JSON.stringify(vars)}`, () => {
    assert.ok(
      containmentErrors(
        JSON.stringify({
          vars,
          secrets: {
            required: [
              'MEET_AI_DISABLED_WORKSPACE_IDS',
              'MEET_AI_PROTECTED_WORKSPACE_IDS',
            ],
          },
        }),
        'wrangler.jsonc'
      ).length
    );
  });
}
test('rejects missing required secrets', () => {
  assert.ok(
    containmentErrors(
      JSON.stringify({
        vars: { MEET_AI_DISABLED: 'true', MEET_AI_ENABLED_WORKSPACE_IDS: '' },
        secrets: { required: [] },
      }),
      'wrangler.jsonc'
    ).length
  );
});
test('catches TypeScript config regressions without evaluating code', () => {
  assert.ok(
    containmentErrors(
      "export default defineConfig({cloudflare:{vars:{MEET_AI_DISABLED:'false'}, secrets:{required:[]}}})",
      'void.config.ts'
    ).length
  );
});

test('rejects the all-workspaces opt-in or a spread in TypeScript vars whatever the value', () => {
  const config = (vars) =>
    `export default defineConfig({name:'tuturuuu-meet',vars:{MEET_AI_DISABLED:'false',MEET_AI_ENABLED_WORKSPACE_IDS:'',${vars}},secrets:{required:['MEET_AI_DISABLED_WORKSPACE_IDS','MEET_AI_PROTECTED_WORKSPACE_IDS']}})`;
  assert.deepEqual(
    containmentErrors(config("OTHER:'x'"), 'void.config.ts'),
    []
  );
  for (const vars of [
    'MEET_AI_ALL_WORKSPACES: optIn',
    'MEET_AI_ALL_WORKSPACES: process.env.OPT_IN',
    "['MEET_AI_ALL_WORKSPACES']: 'x'",
    '...extraVars',
  ])
    assert.ok(containmentErrors(config(vars), 'void.config.ts').length, vars);
});
