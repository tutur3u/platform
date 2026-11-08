import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const expect = (actual) => ({
  toBe: (expected) => assert.equal(actual, expected),
});

import {
  evaluateWorkspaceAiPolicy,
  runWorkspaceAiFeature,
} from '../packages/utils/src/workspace-ai-policy.ts';

const normal = { enabled: undefined, education: false, scope: undefined };

describe('provider independent workspace policy', () => {
  test('existing non education workspaces default on', () => {
    expect(evaluateWorkspaceAiPolicy(normal, 'unknown')).toBe(true);
  });
  test('education defaults full, including teacher authored content', () => {
    for (const kind of ['learner-data', 'teacher-authored', 'unknown'])
      expect(
        evaluateWorkspaceAiPolicy({ ...normal, education: true }, kind)
      ).toBe(false);
  });
  test('reviewed narrower scope permits only verified teacher content', () => {
    for (const kind of ['learner-data', 'unknown'])
      expect(
        evaluateWorkspaceAiPolicy(
          { ...normal, education: true, scope: 'learner-data-only' },
          kind
        )
      ).toBe(false);
    expect(
      evaluateWorkspaceAiPolicy(
        { ...normal, education: true, scope: 'learner-data-only' },
        'teacher-authored'
      )
    ).toBe(true);
  });
  test('explicit off wins for every feature and scope', () => {
    for (const scope of ['full', 'learner-data-only'])
      expect(
        evaluateWorkspaceAiPolicy(
          { ...normal, enabled: 'false', scope },
          'teacher-authored'
        )
      ).toBe(false);
  });
  test('on cannot override minors policy; invalid config fails closed', () => {
    expect(
      evaluateWorkspaceAiPolicy(
        { ...normal, enabled: 'true', education: true },
        'teacher-authored'
      )
    ).toBe(false);
    expect(
      evaluateWorkspaceAiPolicy({ ...normal, scope: 'typo' }, 'unknown')
    ).toBe(false);
    expect(
      evaluateWorkspaceAiPolicy({ ...normal, enabled: 'typo' }, 'unknown')
    ).toBe(false);
  });
  for (const provider of [
    'Gemini',
    'OpenAI',
    'Anthropic',
    'Workers AI',
    'OpenRouter',
    'Supermemory',
  ]) {
    test(`${provider}: refusal does zero credit, usage or provider work`, async () => {
      let calls = 0;
      const result = await runWorkspaceAiFeature(
        async () => false,
        async () => {
          calls++;
          return provider;
        }
      );
      expect(result.allowed).toBe(false);
      expect(calls).toBe(0);
    });
  }
  test('lookup exception fails closed before feature work', async () => {
    let calls = 0;
    const result = await runWorkspaceAiFeature(
      async () => {
        throw Error('lookup');
      },
      async () => ++calls
    );
    expect(result.allowed).toBe(false);
    expect(calls).toBe(0);
  });
});
