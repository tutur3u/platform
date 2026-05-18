import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
} from '@/lib/workspace-storage-config';

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

describe('resolveWebglPackageExtractConfig', () => {
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
});
