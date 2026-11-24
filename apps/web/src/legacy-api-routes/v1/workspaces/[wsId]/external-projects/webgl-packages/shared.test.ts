import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
} from '@tuturuuu/storage-core/workspace-storage-config';
import type {
  WorkspaceSecretRevealResult,
  WorkspaceSecretsBinding,
} from '@tuturuuu/utils/workspace-secrets/protocol';
import {
  configureWorkspaceSecretsRuntime,
  WorkspaceSecretsUnavailableError,
} from '@tuturuuu/utils/workspace-secrets/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSecrets: vi.fn(),
  getWorkspaceConfig: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

const policyKey = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[policyKey];
  vi.unstubAllEnvs();
  configureWorkspaceSecretsRuntime(null);
});

function installFakeBinding(result: WorkspaceSecretRevealResult) {
  const binding = {
    keyStatus: vi.fn(),
    put: vi.fn(),
    rename: vi.fn(),
    reveal: vi.fn(async () => result),
  };
  configureWorkspaceSecretsRuntime(
    binding as unknown as WorkspaceSecretsBinding
  );
  return binding;
}

const workspaceProxyRows = [
  {
    name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
    value: 'https://workspace-proxy.example.com/extract',
  },
  { name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET, value: 'plaintext-token' },
];

describe('resolveWebglPackageExtractConfig', () => {
  it('rejects an untrusted callback origin without falling back to the request', async () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://evil.example');
    (globalThis as Record<symbol, unknown>)[policyKey] = () => {
      throw new Error('Untrusted Web origin');
    };
    const { resolveWebglCallbackOrigin } = await import('./shared');
    expect(() => resolveWebglCallbackOrigin('https://tuturuuu.com')).toThrow(
      'Untrusted Web origin'
    );
  });
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DRIVE_AUTO_EXTRACT_PROXY_URL;
    delete process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN;
  });

  it('uses the process fallback proxy pair when workspace proxy secrets are absent', async () => {
    process.env.DRIVE_AUTO_EXTRACT_PROXY_URL =
      'http://storage-unzip-proxy:8788/extract';
    process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN = 'global-token';
    mocks.getSecrets.mockResolvedValue([]);

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(resolveWebglPackageExtractConfig('ws-1')).resolves.toEqual({
      configured: true,
      proxyToken: 'global-token',
      proxyUrl: 'http://storage-unzip-proxy:8788/extract',
    });
  });

  it('does not pair a workspace proxy URL with the process fallback token', async () => {
    process.env.DRIVE_AUTO_EXTRACT_PROXY_URL =
      'http://storage-unzip-proxy:8788/extract';
    process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN = 'global-token';
    mocks.getSecrets.mockResolvedValue([
      {
        name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
        value: 'https://attacker.example.com/extract',
      },
    ]);

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(resolveWebglPackageExtractConfig('ws-1')).resolves.toEqual({
      configured: false,
      proxyToken: undefined,
      proxyUrl: 'https://attacker.example.com/extract',
    });
  });

  it('uses a workspace proxy token when a workspace proxy URL is set', async () => {
    process.env.DRIVE_AUTO_EXTRACT_PROXY_URL =
      'http://storage-unzip-proxy:8788/extract';
    process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN = 'global-token';
    mocks.getSecrets.mockResolvedValue([
      {
        name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
        value: 'https://workspace-proxy.example.com/extract',
      },
      {
        name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
        value: 'workspace-token',
      },
    ]);

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(resolveWebglPackageExtractConfig('ws-1')).resolves.toEqual({
      configured: true,
      proxyToken: 'workspace-token',
      proxyUrl: 'https://workspace-proxy.example.com/extract',
    });
  });

  it('reads the workspace proxy token from the Worker when a binding is installed', async () => {
    mocks.getSecrets.mockResolvedValue(workspaceProxyRows);
    const binding = installFakeBinding({
      status: 'ok',
      value: 'worker-token',
      valueRev: 3,
    });

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(resolveWebglPackageExtractConfig('ws-1')).resolves.toEqual({
      configured: true,
      proxyToken: 'worker-token',
      proxyUrl: 'https://workspace-proxy.example.com/extract',
    });
    expect(binding.reveal).toHaveBeenCalledTimes(1);
    expect(binding.reveal).toHaveBeenCalledWith({
      name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
      purpose: 'storage',
      wsId: 'ws-1',
    });
  });

  it('ignores the plaintext token when the Worker has none stored', async () => {
    mocks.getSecrets.mockResolvedValue(workspaceProxyRows);
    installFakeBinding({ status: 'not_found' });

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(resolveWebglPackageExtractConfig('ws-1')).resolves.toEqual({
      configured: false,
      proxyToken: undefined,
      proxyUrl: 'https://workspace-proxy.example.com/extract',
    });
  });

  it('fails closed when the Worker is unavailable', async () => {
    mocks.getSecrets.mockResolvedValue(workspaceProxyRows);
    installFakeBinding({ status: 'unavailable' });

    const { resolveWebglPackageExtractConfig } = await import('./shared');

    await expect(
      resolveWebglPackageExtractConfig('ws-1')
    ).rejects.toMatchObject({
      name: WorkspaceSecretsUnavailableError.name,
      status: 'unavailable',
    });
  });
});
