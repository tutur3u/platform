import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMailPreviewAppearance,
  resolveMailPreviewAppearance,
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
  it('returns to the app theme when the saved original preference is cleared', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    setMailPreviewAppearance('original');
    storage.clear();
    expect(getMailPreviewAppearance()).toBe('auto');
  });
  it('retains the selected preference when writes fail but reads still work', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
    });
    setMailPreviewAppearance('original');
    expect(getMailPreviewAppearance()).toBe('original');
  });
});

it('follows the selected app theme unless the reader explicitly overrides it', () => {
  expect(resolveMailPreviewAppearance('auto', 'dark')).toBe('dark');
  expect(resolveMailPreviewAppearance('auto', 'light')).toBe('original');
  expect(resolveMailPreviewAppearance('original', 'dark')).toBe('original');
  expect(resolveMailPreviewAppearance('dark', 'light')).toBe('dark');
});
