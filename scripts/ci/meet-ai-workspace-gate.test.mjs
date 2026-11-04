import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMeetAiEnabledForWorkspace } from '../../packages/realtime/src/meet/ai-workspace-gate.ts';

const wsId = '00000000-0000-4000-8000-0000000000aa';
test('only exact lowercase false or zero enables AI', () => {
  for (const value of [
    undefined,
    null,
    true,
    false,
    0,
    '',
    'true',
    'FALSE',
    'False',
    ' false',
    'false ',
    ' 0',
    'garbage',
  ])
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, { MEET_AI_DISABLED: value }),
      false
    );
  for (const value of ['false', '0'])
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, { MEET_AI_DISABLED: value }),
      true
    );
  assert.equal(isMeetAiEnabledForWorkspace(wsId, undefined), false);
  assert.equal(isMeetAiEnabledForWorkspace(wsId, {}), false);
});
test('explicit enable preserves denylist and legacy allowlist restrictions', () => {
  for (const value of ['false', '0']) {
    const env = { MEET_AI_DISABLED: value };
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, {
        ...env,
        MEET_AI_DISABLED_WORKSPACE_IDS: wsId,
      }),
      false
    );
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, {
        ...env,
        MEET_AI_DISABLED_WORKSPACE_IDS: '*',
      }),
      false
    );
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, {
        ...env,
        MEET_AI_ENABLED_WORKSPACE_IDS: '',
      }),
      false
    );
    assert.equal(
      isMeetAiEnabledForWorkspace(wsId, {
        ...env,
        MEET_AI_ENABLED_WORKSPACE_IDS: wsId,
      }),
      true
    );
  }
});
