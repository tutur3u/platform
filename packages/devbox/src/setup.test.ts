import { describe, expect, it } from 'vitest';
import {
  createDevboxSetupPlan,
  createLocalSupabaseEnv,
  getDefaultDevboxCheckoutPath,
  getDevboxSupabaseEnvKeysForApp,
  isTuturuuuPlatformRepositoryUrl,
  parseLocalSupabaseStatus,
  redactDevboxSupabaseEnv,
  upsertDevboxEnvContent,
} from './setup';

describe('createDevboxSetupPlan', () => {
  it('creates Homebrew commands for missing macOS tools', () => {
    expect(
      createDevboxSetupPlan({
        missingTools: ['node', 'bun', 'docker', 'git'],
        packageManager: 'brew',
        platform: 'darwin',
      }).commands
    ).toEqual([
      ['brew', 'install', 'node'],
      ['brew', 'install', 'bun'],
      ['brew', 'install', '--cask', 'docker'],
      ['brew', 'install', 'git'],
    ]);
  });

  it('uses winget for Windows setup when available', () => {
    expect(
      createDevboxSetupPlan({
        missingTools: ['node', 'bun'],
        packageManager: 'winget',
        platform: 'win32',
      }).commands
    ).toEqual([
      ['winget', 'install', 'OpenJS.NodeJS.LTS'],
      ['winget', 'install', 'Oven-sh.Bun'],
    ]);
  });
});

describe('devbox setup bootstrap helpers', () => {
  it('resolves the default checkout path under Documents', () => {
    expect(
      getDefaultDevboxCheckoutPath({
        homeDir: '/Users/codex',
        platform: 'darwin',
      })
    ).toBe('/Users/codex/Documents/tuturuuu');
    expect(
      getDefaultDevboxCheckoutPath({
        homeDir: 'C:\\Users\\codex',
        platform: 'win32',
      })
    ).toBe('C:\\Users\\codex\\Documents\\tuturuuu');
  });

  it.each([
    'https://github.com/tutur3u/platform.git',
    'https://github.com/tutur3u/platform',
    'git@github.com:tutur3u/platform.git',
    'ssh://git@github.com/tutur3u/platform.git',
  ])('accepts Tuturuuu platform remote %s', (remote) => {
    expect(isTuturuuuPlatformRepositoryUrl(remote)).toBe(true);
  });

  it.each([
    '',
    'https://github.com/tutur3u/other.git',
    'https://github.com/example/platform.git',
  ])('rejects non-platform remote %s', (remote) => {
    expect(isTuturuuuPlatformRepositoryUrl(remote)).toBe(false);
  });

  it('parses local Supabase status output across key styles', () => {
    expect(
      parseLocalSupabaseStatus(
        JSON.stringify({
          'API URL': 'http://127.0.0.1:8001/rest/v1',
          'DB URL': 'postgresql://postgres:postgres@127.0.0.1:8002/postgres',
          'anon key': 'anon-local',
          'service_role key': 'service-local',
          'Studio URL': 'http://127.0.0.1:8003',
        })
      )
    ).toEqual({
      anonKey: 'anon-local',
      apiUrl: 'http://127.0.0.1:8001',
      dbUrl: 'postgresql://postgres:postgres@127.0.0.1:8002/postgres',
      serviceRoleKey: 'service-local',
      studioUrl: 'http://127.0.0.1:8003',
    });
  });

  it('creates local Supabase env values and redacts key output', () => {
    const env = createLocalSupabaseEnv({
      anonKey: 'anon-local',
      apiUrl: 'http://127.0.0.1:8001',
      serviceRoleKey: 'service-local',
    });

    expect(env).toEqual({
      DOCKER_INTERNAL_SUPABASE_URL: 'http://host.docker.internal:8001',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'anon-local',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
      SUPABASE_SECRET_KEY: 'service-local',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
      SUPABASE_URL: 'http://127.0.0.1:8001',
    });
    expect(redactDevboxSupabaseEnv(env)).toEqual({
      DOCKER_INTERNAL_SUPABASE_URL: '[REDACTED]',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '[REDACTED]',
      NEXT_PUBLIC_SUPABASE_URL: '[REDACTED]',
      SUPABASE_SECRET_KEY: '[REDACTED]',
      SUPABASE_SERVER_URL: '[REDACTED]',
      SUPABASE_URL: '[REDACTED]',
    });
  });

  it('selects server and Docker Supabase keys for Next-style env examples', () => {
    expect(
      getDevboxSupabaseEnvKeysForApp({
        exampleContent: [
          'NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY',
          'SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY',
        ].join('\n'),
      })
    ).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVER_URL',
      'SUPABASE_URL',
      'DOCKER_INTERNAL_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SECRET_KEY',
    ]);
  });

  it('keeps non-Next env targets scoped to declared Supabase keys', () => {
    expect(
      getDevboxSupabaseEnvKeysForApp({
        exampleContent: [
          'SUPABASE_URL=YOUR_SUPABASE_URL',
          'SUPABASE_SECRET_KEY=YOUR_SECRET_KEY',
        ].join('\n'),
      })
    ).toEqual(['SUPABASE_URL', 'SUPABASE_SECRET_KEY']);
  });

  it('upserts Supabase env keys while preserving unrelated lines', () => {
    expect(
      upsertDevboxEnvContent({
        content: [
          '# Existing app config',
          'NEXT_PUBLIC_SUPABASE_URL=https://old.example',
          'UNCHANGED=value',
        ].join('\n'),
        env: {
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'anon-local',
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
          SUPABASE_SECRET_KEY: 'service-local',
        },
        keys: [
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'SUPABASE_SECRET_KEY',
        ],
      })
    ).toBe(
      [
        '# Existing app config',
        'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001',
        'UNCHANGED=value',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=anon-local',
        'SUPABASE_SECRET_KEY=service-local',
        '',
      ].join('\n')
    );
  });
});
