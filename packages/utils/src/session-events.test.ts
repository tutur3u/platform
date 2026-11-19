/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { announceSessionEnding, onSessionEnding } from './session-events';

describe('session events', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onSessionEnding(listener);

    announceSessionEnding();
    unsubscribe();
    announceSessionEnding();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
