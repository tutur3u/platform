import { describe, expect, it } from 'vitest';
import {
  clearHostScopedConfig,
  DEFAULT_BASE_URL,
  getDefaultConfigPath,
  getEnvLocalBaseUrl,
  normalizeBaseUrl,
  normalizeHostBaseUrl,
  PORTLESS_LOCAL_BASE_URL,
  resolveCliHostBaseUrl,
} from './config';

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

  it('infers http for bare localhost origins in CLI host mode', () => {
    expect(normalizeHostBaseUrl('localhost:7803')).toBe(
      'http://localhost:7803'
    );
    expect(normalizeHostBaseUrl('tuturuuu.localhost')).toBe(
      PORTLESS_LOCAL_BASE_URL
    );
  });

  it('resolves host aliases and local port variants', () => {
    expect(resolveCliHostBaseUrl('production')).toBe(DEFAULT_BASE_URL);
    expect(resolveCliHostBaseUrl('prod')).toBe(DEFAULT_BASE_URL);
    expect(resolveCliHostBaseUrl('local', { env: {} })).toBe(
      PORTLESS_LOCAL_BASE_URL
    );
    expect(resolveCliHostBaseUrl('localhost', { port: '7803' })).toBe(
      'http://localhost:7803'
    );
    expect(
      resolveCliHostBaseUrl('local', { port: '1355', portless: true })
    ).toBe('https://tuturuuu.localhost:1355');
  });

  it('uses safe local env urls in precedence order', () => {
    expect(
      getEnvLocalBaseUrl({
        NEXT_PUBLIC_APP_URL: 'http://localhost:7803',
        PORTLESS_URL: 'https://tuturuuu.localhost:1355',
        TUTURUUU_LOCAL_BASE_URL: 'https://example.com',
      })
    ).toBe('https://tuturuuu.localhost:1355');
    expect(
      resolveCliHostBaseUrl('local', {
        env: {
          WEB_APP_URL: 'http://localhost:17803',
        },
      })
    ).toBe('http://localhost:17803');
  });

  it('clears session and selected context when changing host origin', () => {
    expect(
      clearHostScopedConfig(
        {
          baseUrl: DEFAULT_BASE_URL,
          currentBoardId: 'board-1',
          currentWorkspaceId: 'ws-1',
          session: {
            accessToken: 'access',
            refreshToken: 'refresh',
          },
          updateCheck: {
            checkedAt: '2026-06-10T00:00:00.000Z',
            latestVersion: '1.0.0',
          },
        },
        'http://localhost:7803'
      )
    ).toEqual({
      baseUrl: 'http://localhost:7803',
      updateCheck: {
        checkedAt: '2026-06-10T00:00:00.000Z',
        latestVersion: '1.0.0',
      },
    });
  });
});
