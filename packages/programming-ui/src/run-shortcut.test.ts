import { describe, expect, it } from 'vitest';
import {
  isApplePlatform,
  isRunShortcut,
  runShortcutKeys,
} from './run-shortcut';

const key = (overrides: Partial<Parameters<typeof isRunShortcut>[0]> = {}) => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('run shortcut', () => {
  it('accepts Cmd+Enter and Ctrl+Enter only', () => {
    expect(isRunShortcut(key({ metaKey: true }))).toBe(true);
    expect(isRunShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isRunShortcut(key())).toBe(false);
    expect(isRunShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isRunShortcut(key({ metaKey: true, altKey: true }))).toBe(false);
    expect(isRunShortcut(key({ key: 'a', ctrlKey: true }))).toBe(false);
    expect(isRunShortcut(key({ ctrlKey: true, isComposing: true }))).toBe(
      false
    );
  });

  it('names the platform modifier', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(
      isApplePlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18)' })
    ).toBe(true);
    expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
    expect(runShortcutKeys(true)).toEqual(['⌘', 'Enter']);
    expect(runShortcutKeys(false)).toEqual(['Ctrl', 'Enter']);
  });
});
