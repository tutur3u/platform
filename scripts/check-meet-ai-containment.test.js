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
for (const vars of [
  {},
  { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '' },
  { MEET_AI_DISABLED: true, MEET_AI_ENABLED_WORKSPACE_IDS: '' },
  { MEET_AI_DISABLED: 'true', MEET_AI_ENABLED_WORKSPACE_IDS: '*' },
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
