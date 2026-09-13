import type { ModelMessage } from 'ai';
import { expect, it } from 'vitest';
import { shouldPresentWorkspaceArtifact } from './mira-artifact-intent';

const messages = (...texts: string[]): ModelMessage[] =>
  texts.map((content) => ({ role: 'user', content }));
it.each([
  'show me my tasks',
  'show my tasks without completed items',
  'open my calendar',
  'present my finances',
  'show my finance overview',
  'show my meetings',
  'Cho tôi xem công việc',
])('opens product presentation: %s', (text) => {
  expect(shouldPresentWorkspaceArtifact(messages(text))).toBe(true);
});
it('resolves the exported artifact follow-up using recent user context', () => {
  expect(
    shouldPresentWorkspaceArtifact(
      messages('show me my tasks', 'should show it in artifact')
    )
  ).toBe(true);
});
it.each([
  'create a task',
  'do not open my tasks',
  'show my tasks as text only',
  'how do I show my tasks?',
  'show me a poem',
])('does not force a panel: %s', (text) => {
  expect(shouldPresentWorkspaceArtifact(messages(text))).toBe(false);
});
