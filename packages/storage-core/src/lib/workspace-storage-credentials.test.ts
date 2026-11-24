import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type {
  WorkspaceSecretRevealInput,
  WorkspaceSecretRevealResult,
  WorkspaceSecretsBinding,
} from '@tuturuuu/utils/workspace-secrets/protocol';
import {
  configureWorkspaceSecretsRuntime,
  WorkspaceSecretsUnavailableError,
} from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_PROJECT_ENABLED_SECRET } from './external-projects/constants';
import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
  DRIVE_STORAGE_PROVIDER_SECRET,
} from './workspace-storage-config';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  getSecrets: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (
    ...args: Parameters<typeof mocks.createDynamicAdminClient>
  ) => mocks.createDynamicAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

const WS_ID = '11111111-1111-4111-8111-111111111111';

function fakeBinding(
  reveal: (
    input: WorkspaceSecretRevealInput
  ) => Promise<WorkspaceSecretRevealResult>
) {
  const binding = {
    keyStatus: vi.fn(),
    put: vi.fn(),
    rename: vi.fn(),
    reveal: vi.fn(reveal),
  };
  configureWorkspaceSecretsRuntime(
    binding as unknown as WorkspaceSecretsBinding
  );
  return binding;
}

const workerValues: Record<string, string> = {
  [DRIVE_R2_ACCESS_KEY_ID_SECRET]: 'worker-key-id',
  [DRIVE_R2_SECRET_ACCESS_KEY_SECRET]: 'worker-secret-key',
  [DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET]: 'worker-proxy-token',
};

async function revealFromWorker(
  input: WorkspaceSecretRevealInput
): Promise<WorkspaceSecretRevealResult> {
  const value = workerValues[input.name];
  return value ? { status: 'ok', value, valueRev: 1 } : { status: 'not_found' };
}

const r2Rows = [
  { name: DRIVE_STORAGE_PROVIDER_SECRET, value: 'r2' },
  { name: DRIVE_R2_BUCKET_SECRET, value: 'drive-bucket' },
  { name: DRIVE_R2_ENDPOINT_SECRET, value: 'https://r2.example.com' },
  { name: DRIVE_R2_ACCESS_KEY_ID_SECRET, value: 'plain-key-id' },
  { name: DRIVE_R2_SECRET_ACCESS_KEY_SECRET, value: 'plain-secret-key' },
];

const autoExtractRows = [
  { name: EXTERNAL_PROJECT_ENABLED_SECRET, value: 'true' },
  {
    name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
    value: 'https://zip.example/extract',
  },
  { name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET, value: 'plain-proxy-token' },
];

beforeEach(() => {
  vi.resetModules();
  mocks.getSecrets.mockReset();
  delete process.env.DRIVE_AUTO_EXTRACT_PROXY_URL;
  delete process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN;
});

afterEach(() => {
  configureWorkspaceSecretsRuntime(null);
});

describe('R2 storage credentials', () => {
  it('reads the R2 keys from the Worker with the storage purpose', async () => {
    mocks.getSecrets.mockResolvedValue(r2Rows);
    const binding = fakeBinding(revealFromWorker);
    const { resolveWorkspaceStorageBackendConfig } =
      await import('./workspace-storage-provider');

    await expect(
      resolveWorkspaceStorageBackendConfig(WS_ID, 'r2')
    ).resolves.toEqual({
      provider: 'r2',
      misconfigured: false,
      bucket: 'drive-bucket',
      endpoint: 'https://r2.example.com',
      accessKeyId: 'worker-key-id',
      secretAccessKey: 'worker-secret-key',
    });
    expect(binding.reveal).toHaveBeenCalledTimes(2);
    expect(binding.reveal).toHaveBeenCalledWith({
      name: DRIVE_R2_ACCESS_KEY_ID_SECRET,
      purpose: 'storage',
      wsId: WS_ID,
    });
    expect(binding.reveal).toHaveBeenCalledWith({
      name: DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
      purpose: 'storage',
      wsId: WS_ID,
    });
  });

  it('does not use the plaintext rows for keys the Worker has not stored', async () => {
    mocks.getSecrets.mockResolvedValue(r2Rows);
    fakeBinding(async () => ({ status: 'not_found' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolveWorkspaceStorageProvider } =
      await import('./workspace-storage-provider');

    await expect(resolveWorkspaceStorageProvider(WS_ID)).resolves.toEqual({
      provider: 'supabase',
      misconfigured: true,
    });
    expect(warn.mock.calls.flat().join(' ')).not.toContain('plain');
    warn.mockRestore();
  });

  it('resolves the internal slug to the root workspace for the Worker', async () => {
    mocks.getSecrets.mockResolvedValue(r2Rows);
    const binding = fakeBinding(revealFromWorker);
    const { resolveWorkspaceStorageProvider } =
      await import('./workspace-storage-provider');

    await resolveWorkspaceStorageProvider('internal');
    expect(binding.reveal).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: ROOT_WORKSPACE_ID })
    );
  });

  it('skips the Worker for Supabase-backed workspaces', async () => {
    mocks.getSecrets.mockResolvedValue([]);
    const binding = fakeBinding(revealFromWorker);
    const { resolveWorkspaceStorageProvider } =
      await import('./workspace-storage-provider');

    await expect(resolveWorkspaceStorageProvider(WS_ID)).resolves.toEqual({
      provider: 'supabase',
      misconfigured: false,
    });
    expect(binding.reveal).not.toHaveBeenCalled();
  });

  it('reads the plaintext rows when no binding is installed', async () => {
    mocks.getSecrets.mockResolvedValue(r2Rows);
    const { resolveWorkspaceStorageBackendConfig } =
      await import('./workspace-storage-provider');

    await expect(
      resolveWorkspaceStorageBackendConfig(WS_ID, 'r2')
    ).resolves.toMatchObject({
      provider: 'r2',
      accessKeyId: 'plain-key-id',
      secretAccessKey: 'plain-secret-key',
    });
  });

  it('fails closed when the Worker is unavailable', async () => {
    mocks.getSecrets.mockResolvedValue(r2Rows);
    fakeBinding(async () => ({ status: 'unavailable' }));
    const { resolveWorkspaceStorageBackendConfig } =
      await import('./workspace-storage-provider');

    await expect(
      resolveWorkspaceStorageBackendConfig(WS_ID, 'r2')
    ).rejects.toMatchObject({
      name: WorkspaceSecretsUnavailableError.name,
      status: 'unavailable',
    });
  });
});

describe('auto-extract proxy token', () => {
  it('reads the proxy token from the Worker with the storage purpose', async () => {
    mocks.getSecrets.mockResolvedValue(autoExtractRows);
    const binding = fakeBinding(revealFromWorker);
    const { resolveWorkspaceStorageAutoExtractConfig } =
      await import('./workspace-storage-auto-extract');

    await expect(
      resolveWorkspaceStorageAutoExtractConfig(WS_ID)
    ).resolves.toEqual({
      enabled: true,
      configured: true,
      proxyUrl: 'https://zip.example/extract',
      proxyToken: 'worker-proxy-token',
    });
    expect(binding.reveal).toHaveBeenCalledTimes(1);
    expect(binding.reveal).toHaveBeenCalledWith({
      name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
      purpose: 'storage',
      wsId: WS_ID,
    });
  });

  it('reads the plaintext row when no binding is installed', async () => {
    mocks.getSecrets.mockResolvedValue(autoExtractRows);
    const { resolveWorkspaceStorageAutoExtractConfig } =
      await import('./workspace-storage-auto-extract');

    await expect(
      resolveWorkspaceStorageAutoExtractConfig(WS_ID)
    ).resolves.toMatchObject({ proxyToken: 'plain-proxy-token' });
  });

  it('fails closed when the Worker refuses the reveal', async () => {
    mocks.getSecrets.mockResolvedValue(autoExtractRows);
    fakeBinding(async () => ({ status: 'forbidden' }));
    const { resolveWorkspaceStorageAutoExtractConfig } =
      await import('./workspace-storage-auto-extract');

    await expect(
      resolveWorkspaceStorageAutoExtractConfig(WS_ID)
    ).rejects.toMatchObject({
      name: WorkspaceSecretsUnavailableError.name,
      status: 'forbidden',
    });
  });
});
