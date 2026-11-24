import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  WORKSPACE_CREDENTIAL_SECRET_REFERENCES,
  WORKSPACE_SECRETS_DIRECT_READERS,
} from './__tests__/workspace-secret-readers';
import {
  filterWorkspaceSecretScanMatches,
  loadWorkspaceSecretScanSources,
  WORKSPACE_SECRETS_TABLE_PATTERN,
  type WorkspaceSecretScanSource,
} from './__tests__/workspace-secret-scan';
import {
  canKeepWorkspaceSecretValueOnRename,
  getWorkspaceSecretPolicy,
  getWorkspaceSecretTier,
  isWorkspaceSecretValueClientVisible,
  toClientWorkspaceSecret,
  WORKSPACE_CREDENTIAL_SECRET_NAMES,
  WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES,
} from './workspace-secret-policy';

const REPO_ROOT = resolve(__dirname, '../../..');

describe('workspace secret policy', () => {
  it.each([
    ['ENABLE_CHAT', 'config', 'boolean'],
    ['DISABLE_INVITE', 'config', 'boolean'],
    ['PREVENT_WORKSPACE_DELETION', 'config', 'boolean'],
    ['STORAGE_LIMIT_BYTES', 'config', 'number'],
    ['RATE_LIMIT_MAX_REQUESTS', 'config', 'number'],
    ['DRIVE_STORAGE_PROVIDER', 'config', 'string'],
    ['DRIVE_R2_BUCKET', 'config', 'string'],
    ['MOBILE_HIDDEN_MODULES', 'config', 'json'],
    ['TUTURUUU_CLI_ACCESS_TTL_SECONDS', 'config', 'number'],
    ['EXTERNAL_APP_REGISTRY:cms:origins', 'config', 'string'],
    ['AI_AGENT_REGISTRY:support:meta', 'config', 'string'],
  ] as const)('classifies %s as %s', (name, tier, type) => {
    expect(getWorkspaceSecretPolicy(name)).toEqual({
      clientVisible: true,
      tier,
      type,
    });
  });

  it.each([
    ...WORKSPACE_CREDENTIAL_SECRET_NAMES,
    'AI_AGENT_REGISTRY:support:channel:main:secret:botToken',
    'EXTERNAL_APP_REGISTRY:cms:secretHash',
    'SOME_UNREGISTERED_NAME',
    'constructor',
    '__proto__',
    '',
  ])('keeps %s in the credential tier', (name) => {
    expect(getWorkspaceSecretTier(name)).toBe('credential');
    expect(isWorkspaceSecretValueClientVisible(name)).toBe(false);
  });

  it('keeps credential-grade config values server-side', () => {
    for (const name of WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES) {
      expect(getWorkspaceSecretTier(name)).toBe('config');
      expect(isWorkspaceSecretValueClientVisible(name)).toBe(false);
    }
  });

  it('withholds hidden values but reports whether one is set', () => {
    expect(
      toClientWorkspaceSecret({
        id: 'a',
        name: 'DRIVE_R2_SECRET_ACCESS_KEY',
        value: 'secret',
      })
    ).toEqual({
      id: 'a',
      name: 'DRIVE_R2_SECRET_ACCESS_KEY',
      tier: 'credential',
      value: null,
      value_masked: true,
      value_set: true,
    });
    expect(
      toClientWorkspaceSecret({ name: 'ENABLE_CHAT', value: 'true' })
    ).toMatchObject({ value: 'true', value_masked: false, value_set: true });
    expect(
      toClientWorkspaceSecret({ name: 'X_TOKEN', value: null })
    ).toMatchObject({ value: null, value_masked: true, value_set: false });
  });

  it('never moves a hidden value under a client-visible name', () => {
    expect(
      canKeepWorkspaceSecretValueOnRename('DRIVE_R2_ACCESS_KEY_ID', 'ENABLE_X')
    ).toBe(false);
    expect(canKeepWorkspaceSecretValueOnRename('A_TOKEN', 'B_TOKEN')).toBe(
      true
    );
    expect(canKeepWorkspaceSecretValueOnRename('ENABLE_X', 'ENABLE_Y')).toBe(
      true
    );
    expect(canKeepWorkspaceSecretValueOnRename('X_TOKEN', 'X_TOKEN')).toBe(
      true
    );
  });
});

describe('workspace secret registry scan', () => {
  let sources: WorkspaceSecretScanSource[] = [];

  beforeAll(() => {
    sources = loadWorkspaceSecretScanSources(REPO_ROOT);
  }, 120_000);

  it('adds no direct workspace_secrets readers', () => {
    const readers = filterWorkspaceSecretScanMatches(
      sources,
      WORKSPACE_SECRETS_TABLE_PATTERN
    );
    expect(readers).toEqual([...WORKSPACE_SECRETS_DIRECT_READERS].sort());
  });

  it('references credential-tier names only from allowed server paths', () => {
    const credentialPattern = new RegExp(
      [
        ...WORKSPACE_CREDENTIAL_SECRET_NAMES,
        ...WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES,
        'channelSecretKey',
      ].join('|'),
      'u'
    );
    const references = filterWorkspaceSecretScanMatches(
      sources,
      credentialPattern
    );
    expect(references).toEqual(
      [...WORKSPACE_CREDENTIAL_SECRET_REFERENCES].sort()
    );
  });

  it('reads only config-tier names in SQL functions', () => {
    const migrationsDir = join(REPO_ROOT, 'apps/database/supabase/migrations');
    const names = new Set<string>();
    for (const file of readdirSync(migrationsDir)) {
      if (!file.endsWith('.sql')) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      if (!sql.includes('workspace_secrets')) continue;
      for (const match of sql.matchAll(
        /\bname\s*(?:=|in\s*\()\s*'([A-Z][A-Z0-9_:]+)'/gu
      )) {
        if (match[1]) names.add(match[1]);
      }
    }

    expect(names.size).toBeGreaterThan(0);
    expect(
      [...names].filter((name) => getWorkspaceSecretTier(name) !== 'config')
    ).toEqual([]);
  });
});
