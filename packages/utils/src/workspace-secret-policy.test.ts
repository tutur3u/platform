import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  WORKSPACE_CREDENTIAL_SECRET_REFERENCES,
  WORKSPACE_SECRETS_DIRECT_READERS,
} from './__tests__/workspace-secret-readers';
import {
  extractSqlSecretNames,
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

/**
 * Pinned allowlist sizes. The lists may only shrink: lowering a number is
 * expected, raising one means a new plaintext reader and needs a security
 * review.
 */
const MAX_DIRECT_READERS = 68;
const MAX_CREDENTIAL_REFERENCES = 30;

/** Source text that names or reaches a credential-tier secret. */
const CREDENTIAL_REFERENCE_PATTERN = new RegExp(
  [
    ...WORKSPACE_CREDENTIAL_SECRET_NAMES,
    ...WORKSPACE_SERVER_ONLY_CONFIG_SECRET_NAMES,
    'channelSecretKey',
    // The external app registry field, as a quoted key literal.
    '[\'"`]secretHash[\'"`]',
    ':channel:[^:]+:secret:',
    // Storage credential reveals reached through the shared name list.
    'revealWorkspaceStorageCredentials',
    'DRIVE_R2_CREDENTIAL_SECRET_NAMES',
    // Each call to the storage config diagnostic performs two plaintext R2
    // credential reveals with no audit row or rate limit, so every caller
    // needs a security review and an allowlist entry.
    '\\bdiagnoseWorkspaceStorageConfig\\b',
  ].join('|'),
  'u'
);

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
    ['AI_AGENT_REGISTRY:support:instructions', 'config', 'string'],
    ['AI_AGENT_REGISTRY:support:instructions:3', 'config', 'string'],
    ['AI_AGENT_REGISTRY:support:channel:main:meta', 'config', 'string'],
    ['AI_AGENT_IDENTITY:ws-1:zalo:acct-1:user-1', 'config', 'string'],
    ['EXTERNAL_APP_REGISTRY:cms:allowedScopes', 'config', 'string'],
    ['EXTERNAL_APP_REGISTRY:cms:secretLastFour', 'config', 'string'],
    ['EXTERNAL_PROJECT_ENABLED', 'config', 'boolean'],
    ['EXTERNAL_PROJECT_CANONICAL_ID', 'config', 'string'],
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
    // Registry subkeys and names not on an allowlist default to credential.
    'EXTERNAL_APP_REGISTRY:cms:signingKey',
    'EXTERNAL_APP_REGISTRY:cms',
    'AI_AGENT_REGISTRY:support:apiKey',
    'AI_AGENT_REGISTRY:support:instructions:x',
    'AI_AGENT_REGISTRY:support:channel:main:token',
    'AI_AGENT_IDENTITY:ws-1:zalo:acct-1',
    'EXTERNAL_PROJECT_WEBHOOK_SECRET',
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

describe('SQL secret name extraction', () => {
  it('reads every literal in =, IN and ANY(ARRAY[...]) comparisons', () => {
    expect(
      extractSqlSecretNames(`
        where s.name = 'ENABLE_A' and name IN ('DISABLE_B', 'mobile_x:v1')
          or name = any (array['ENABLE_C', 'X_TOKEN'])
          and current_user in ('anon', 'authenticated')
      `).sort()
    ).toEqual(['DISABLE_B', 'ENABLE_A', 'ENABLE_C', 'X_TOKEN', 'mobile_x:v1']);
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
    expect(WORKSPACE_SECRETS_DIRECT_READERS.length).toBeLessThanOrEqual(
      MAX_DIRECT_READERS
    );
  });

  it('references credential-tier names only from allowed server paths', () => {
    const references = filterWorkspaceSecretScanMatches(
      sources,
      CREDENTIAL_REFERENCE_PATTERN
    );
    expect(references).toEqual(
      [...WORKSPACE_CREDENTIAL_SECRET_REFERENCES].sort()
    );
    expect(WORKSPACE_CREDENTIAL_SECRET_REFERENCES.length).toBeLessThanOrEqual(
      MAX_CREDENTIAL_REFERENCES
    );
  });

  it('flags callers of the storage config diagnostic', () => {
    const caller = [
      "import { diagnoseWorkspaceStorageConfig } from '@tuturuuu/storage-core/workspace-storage-config-diagnostics';",
      'export const GET = async () => diagnoseWorkspaceStorageConfig(wsId);',
    ].join('\n');
    const settingsOnly =
      'diagnoseWorkspaceStorageSettings(wsId, settings); diagnoseWorkspaceStorageConfigs();';

    expect(CREDENTIAL_REFERENCE_PATTERN.test(caller)).toBe(true);
    expect(CREDENTIAL_REFERENCE_PATTERN.test(settingsOnly)).toBe(false);
  });

  it('reads only config-tier names in SQL functions', () => {
    const migrationsDir = join(REPO_ROOT, 'apps/database/supabase/migrations');
    const names = new Set<string>();
    for (const file of readdirSync(migrationsDir)) {
      if (!file.endsWith('.sql')) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      if (!sql.includes('workspace_secrets')) continue;
      for (const name of extractSqlSecretNames(sql)) names.add(name);
    }

    expect(names.size).toBeGreaterThan(0);
    expect(
      [...names].filter((name) => getWorkspaceSecretTier(name) !== 'config')
    ).toEqual([]);
  });
});
