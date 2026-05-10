import { describe, expect, it } from 'vitest';
import { getDefaultConfigPath, normalizeBaseUrl } from './config';

describe('CLI config path resolution', () => {
  it('uses the explicit config path when TUTURUUU_CONFIG is set', () => {
    expect(
      getDefaultConfigPath({
        env: { TUTURUUU_CONFIG: '/tmp/tuturuuu/config.json' },
        homeDir: '/home/alice',
        platform: 'linux',
      })
    ).toBe('/tmp/tuturuuu/config.json');
  });

  it('uses APPDATA on Windows', () => {
    expect(
      getDefaultConfigPath({
        env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' },
        homeDir: 'C:\\Users\\Alice',
        platform: 'win32',
      })
    ).toBe('C:\\Users\\Alice\\AppData\\Roaming\\Tuturuuu\\config.json');
  });

  it('uses Application Support on macOS', () => {
    expect(
      getDefaultConfigPath({
        env: {},
        homeDir: '/Users/alice',
        platform: 'darwin',
      })
    ).toBe('/Users/alice/Library/Application Support/Tuturuuu/config.json');
  });

  it('uses XDG_CONFIG_HOME on Linux', () => {
    expect(
      getDefaultConfigPath({
        env: { XDG_CONFIG_HOME: '/home/alice/.config-alt' },
        homeDir: '/home/alice',
        platform: 'linux',
      })
    ).toBe('/home/alice/.config-alt/tuturuuu/config.json');
  });

  it('rewrites browser-hostile local origins to localhost', () => {
    expect(normalizeBaseUrl('http://0.0.0.0:7803')).toBe(
      'http://localhost:7803'
    );
    expect(normalizeBaseUrl('http://[::]:7803')).toBe('http://localhost:7803');
  });

  it('keeps normal origins unchanged', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:7803')).toBe(
      'http://127.0.0.1:7803'
    );
    expect(normalizeBaseUrl('https://tuturuuu.com/')).toBe(
      'https://tuturuuu.com'
    );
  });
});
