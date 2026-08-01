import { describe, expect, it } from 'vitest';
import { claimSettingsDialogIntent } from './settings-dialog-intent';
import { shouldOwnSettingsDialog } from './settings-dialog-ownership';

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

describe('shouldOwnSettingsDialog', () => {
  it('keeps the shared fallback disabled when an app owns settings', () => {
    expect(shouldOwnSettingsDialog(true)).toBe(false);
  });

  it('preserves the shared fallback for satellites without a settings host', () => {
    expect(shouldOwnSettingsDialog()).toBe(true);
  });
});
