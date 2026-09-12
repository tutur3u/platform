import { expect, it } from 'vitest';
import { getToolPartStatus } from './tool-status';

it.each([
  { success: false },
  { ok: false },
  { ok: true, partialFailure: true },
  { error: 'Assignment failed' },
])(
  'does not mark an unsuccessful product result as completed: %j',
  (output) => {
    expect(
      getToolPartStatus({
        type: 'tool-sync_calendar',
        toolCallId: 'sync-result',
        input: {},
        state: 'output-available',
        output,
      }).isError
    ).toBe(true);
  }
);
it('keeps a successful result successful', () => {
  expect(
    getToolPartStatus({
      type: 'tool-sync_calendar',
      toolCallId: 'sync-result',
      input: {},
      state: 'output-available',
      output: { ok: true },
    }).isError
  ).toBe(false);
});
