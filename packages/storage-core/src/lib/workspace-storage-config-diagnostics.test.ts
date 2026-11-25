import type { WorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/protocol';
import {
  configureWorkspaceSecretsRuntime,
  WorkspaceSecretsUnavailableError,
} from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageConfigurationError } from './storage-configuration-error';
import { WorkspaceStorageError } from './storage-download-error';
import {
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
  DRIVE_STORAGE_PROVIDER_SECRET,
} from './workspace-storage-config';
import {
  diagnoseWorkspaceStorageConfig,
  diagnoseWorkspaceStorageSettings,
  toStorageConfigurationError,
} from './workspace-storage-config-diagnostics';
import { resolveWorkspaceStorageProvider } from './workspace-storage-provider';

const mocks = vi.hoisted(() => ({ getSecrets: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

const WS_ID = '22222222-2222-4222-8222-222222222222';
const SECRET_VALUES = {
  bucket: 'drive-bucket-value',
  endpoint: 'https://endpoint-value.example.com',
  keyId: 'key-id-value',
  secretKey: 'secret-key-value',
};

const completeR2 = [
  { name: DRIVE_STORAGE_PROVIDER_SECRET, value: 'r2' },
  { name: DRIVE_R2_BUCKET_SECRET, value: SECRET_VALUES.bucket },
  { name: DRIVE_R2_ENDPOINT_SECRET, value: SECRET_VALUES.endpoint },
  { name: DRIVE_R2_ACCESS_KEY_ID_SECRET, value: SECRET_VALUES.keyId },
  { name: DRIVE_R2_SECRET_ACCESS_KEY_SECRET, value: SECRET_VALUES.secretKey },
];

function settings(rows: { name: string; value: string }[]) {
  return new Map(rows.map((row) => [row.name, row.value]));
}

function expectNoValues(text: string) {
  for (const value of Object.values(SECRET_VALUES)) {
    expect(text).not.toContain(value);
  }
}

beforeEach(() => {
  mocks.getSecrets.mockReset();
});

afterEach(() => {
  configureWorkspaceSecretsRuntime(null);
  vi.restoreAllMocks();
});

describe('diagnoseWorkspaceStorageSettings', () => {
  it('treats an absent selector as the complete Supabase default', () => {
    const diagnosis = diagnoseWorkspaceStorageSettings(WS_ID, new Map());

    expect(diagnosis).toEqual({
      workspaceId: WS_ID,
      selectorStatus: 'absent',
      selectedBackend: 'supabase',
      missingSettings: [],
      invalidSettings: [],
      complete: true,
      resolution: 'serves-selected',
    });
    expect(toStorageConfigurationError(diagnosis)).toBeNull();
  });

  it('accepts a complete R2 selection written with any case or spacing', () => {
    const rows = completeR2.map((row) =>
      row.name === DRIVE_STORAGE_PROVIDER_SECRET
        ? { ...row, value: ' R2 ' }
        : row
    );
    const diagnosis = diagnoseWorkspaceStorageSettings(WS_ID, settings(rows));

    expect(diagnosis).toMatchObject({
      selectorStatus: 'valid',
      selectedBackend: 'r2',
      complete: true,
      resolution: 'serves-selected',
    });
    expect(toStorageConfigurationError(diagnosis)).toBeNull();
  });

  it('names missing and blank R2 settings without exposing values', () => {
    const rows = completeR2
      .filter((row) => row.name !== DRIVE_R2_BUCKET_SECRET)
      .map((row) =>
        row.name === DRIVE_R2_SECRET_ACCESS_KEY_SECRET
          ? { ...row, value: '   ' }
          : row
      );
    const diagnosis = diagnoseWorkspaceStorageSettings(WS_ID, settings(rows));

    expect(diagnosis).toMatchObject({
      selectedBackend: 'r2',
      missingSettings: [
        DRIVE_R2_BUCKET_SECRET,
        DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
      ],
      complete: false,
      resolution: 'falls-back-to-supabase',
    });
    expectNoValues(JSON.stringify(diagnosis));

    const error = toStorageConfigurationError(diagnosis);
    expect(error).toBeInstanceOf(StorageConfigurationError);
    expect(error).toBeInstanceOf(WorkspaceStorageError);
    expect(error).toMatchObject({
      failureClass: 'configuration',
      workspaceId: WS_ID,
      backend: 'r2',
      missingSettings: [
        DRIVE_R2_BUCKET_SECRET,
        DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
      ],
      invalidSettings: [],
      status: 503,
      message: `Storage backend "r2" is missing required settings: ${DRIVE_R2_BUCKET_SECRET}, ${DRIVE_R2_SECRET_ACCESS_KEY_SECRET}.`,
    });
    expectNoValues(String(error?.message));
  });

  it('treats a blank selector as the Supabase default', () => {
    expect(
      diagnoseWorkspaceStorageSettings(
        WS_ID,
        settings([{ name: DRIVE_STORAGE_PROVIDER_SECRET, value: '   ' }])
      )
    ).toMatchObject({
      selectorStatus: 'absent',
      selectedBackend: 'supabase',
      invalidSettings: [],
      complete: true,
    });
  });

  it('flags an unrecognized selector without echoing its value', () => {
    const diagnosis = diagnoseWorkspaceStorageSettings(
      WS_ID,
      settings([{ name: DRIVE_STORAGE_PROVIDER_SECRET, value: 'gcs-value' }])
    );

    expect(diagnosis).toMatchObject({
      selectorStatus: 'unrecognized',
      selectedBackend: 'supabase',
      invalidSettings: [DRIVE_STORAGE_PROVIDER_SECRET],
      resolution: 'serves-selected',
    });

    const error = toStorageConfigurationError(diagnosis);
    expect(error?.backend).toBeNull();
    expect(error?.message).toBe(
      `Storage backend has unrecognized settings: ${DRIVE_STORAGE_PROVIDER_SECRET}.`
    );
    expect(error?.message).not.toContain('gcs-value');
  });
});

describe('diagnoseWorkspaceStorageConfig', () => {
  it.each([
    ['absent selector', []],
    ['complete R2', completeR2],
    [
      'incomplete R2',
      completeR2.filter((row) => row.name !== DRIVE_R2_ENDPOINT_SECRET),
    ],
    [
      'unrecognized selector',
      [{ name: DRIVE_STORAGE_PROVIDER_SECRET, value: 'x' }],
    ],
  ])('agrees with provider resolution for %s', async (_label, rows) => {
    mocks.getSecrets.mockResolvedValue(rows);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const diagnosis = await diagnoseWorkspaceStorageConfig(WS_ID);
    const warningsBefore = warn.mock.calls.length;
    const resolved = await resolveWorkspaceStorageProvider(WS_ID);
    const fallsBack = diagnosis.resolution === 'falls-back-to-supabase';

    expect(warningsBefore).toBe(0);
    expect(resolved).toEqual({
      provider: fallsBack ? 'supabase' : diagnosis.selectedBackend,
      misconfigured: fallsBack,
    });
    expect(warn).toHaveBeenCalledTimes(fallsBack ? 1 : 0);
    expect(mocks.getSecrets).toHaveBeenCalledWith({
      wsId: WS_ID,
      forceAdmin: true,
    });
  });

  it('reads R2 credentials from the secrets Worker like provider resolution', async () => {
    mocks.getSecrets.mockResolvedValue(
      completeR2.filter(
        (row) =>
          row.name !== DRIVE_R2_ACCESS_KEY_ID_SECRET &&
          row.name !== DRIVE_R2_SECRET_ACCESS_KEY_SECRET
      )
    );
    const reveal = vi.fn(async () => ({
      status: 'ok' as const,
      value: 'worker-value',
      valueRev: 1,
    }));
    configureWorkspaceSecretsRuntime({
      reveal,
    } as unknown as WorkspaceSecretsBinding);

    const diagnosis = await diagnoseWorkspaceStorageConfig(WS_ID);

    expect(diagnosis).toMatchObject({ complete: true, missingSettings: [] });
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(diagnosis)).not.toContain('worker-value');
  });

  it('skips credential reveals when Supabase is selected', async () => {
    mocks.getSecrets.mockResolvedValue([]);
    const reveal = vi.fn();
    configureWorkspaceSecretsRuntime({
      reveal,
    } as unknown as WorkspaceSecretsBinding);

    await expect(diagnoseWorkspaceStorageConfig(WS_ID)).resolves.toMatchObject({
      selectedBackend: 'supabase',
      complete: true,
    });
    expect(reveal).not.toHaveBeenCalled();
  });

  it('rejects when the secrets Worker is unavailable', async () => {
    mocks.getSecrets.mockResolvedValue(completeR2);
    configureWorkspaceSecretsRuntime({
      reveal: vi.fn(async () => ({ status: 'unavailable' as const })),
    } as unknown as WorkspaceSecretsBinding);

    await expect(diagnoseWorkspaceStorageConfig(WS_ID)).rejects.toBeInstanceOf(
      WorkspaceSecretsUnavailableError
    );
  });
});
