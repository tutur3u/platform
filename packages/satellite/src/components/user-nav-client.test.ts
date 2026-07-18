import { describe, expect, it } from 'vitest';
import { claimSettingsDialogIntent } from './settings-dialog-intent';

describe('claimSettingsDialogIntent', () => {
  it('allows only one mounted settings host to claim an intent', () => {
    const event = new CustomEvent('tuturuuu:settings-dialog-open-intent', {
      cancelable: true,
    });

    expect(claimSettingsDialogIntent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(claimSettingsDialogIntent(event)).toBe(false);
  });
});
