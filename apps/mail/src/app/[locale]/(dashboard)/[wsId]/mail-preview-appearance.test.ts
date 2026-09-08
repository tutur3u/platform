import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMailPreviewAppearance,
  setMailPreviewAppearance,
} from './mail-preview-appearance';

afterEach(() => vi.unstubAllGlobals());

describe('mail appearance persistence', () => {
  it('restores the saved preference when another message reads it', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    setMailPreviewAppearance('dark');
    expect(getMailPreviewAppearance()).toBe('dark');
    expect(storage.get('tuturuuu-mail-message-appearance')).toBe('dark');
    setMailPreviewAppearance('original');
    expect(getMailPreviewAppearance()).toBe('original');
  });
  it('retains the choice across messages when browser storage is unavailable', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
    });
    setMailPreviewAppearance('dark');
    expect(getMailPreviewAppearance()).toBe('dark');
    setMailPreviewAppearance('original');
  });
  it('returns to dark when the saved original preference is cleared', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    setMailPreviewAppearance('original');
    storage.clear();
    expect(getMailPreviewAppearance()).toBe('dark');
  });
});
