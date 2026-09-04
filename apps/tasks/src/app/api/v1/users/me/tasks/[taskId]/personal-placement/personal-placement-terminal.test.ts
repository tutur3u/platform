import { describe, expect, it } from 'vitest';
import { shouldMoveSourceTaskToTerminalList } from './personal-placement-terminal';

describe('shouldMoveSourceTaskToTerminalList', () => {
  it('keeps a source task in its existing Done list', () => {
    expect(shouldMoveSourceTaskToTerminalList('done', 'done')).toBe(false);
  });

  it('moves an active source task to Done', () => {
    expect(shouldMoveSourceTaskToTerminalList('active', 'done')).toBe(true);
  });

  it('moves a closed source task to Done', () => {
    expect(shouldMoveSourceTaskToTerminalList('closed', 'done')).toBe(true);
  });
});
