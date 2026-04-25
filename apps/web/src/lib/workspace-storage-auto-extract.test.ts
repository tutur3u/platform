import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_PROJECT_ENABLED_SECRET } from './external-projects/constants';
import {
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
} from './workspace-storage-config';

const mocks = vi.hoisted(() => ({
  getSecrets: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

describe('workspace storage auto extract config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DRIVE_AUTO_EXTRACT_PROXY_URL;
    delete process.env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN;
  });

  it('enables ZIP auto extraction when external projects are enabled and proxy secrets exist', async () => {
    mocks.getSecrets.mockResolvedValue([
      {
        name: EXTERNAL_PROJECT_ENABLED_SECRET,
        value: 'true',
      },
      {
        name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
        value: 'https://zip-proxy.example.com/extract',
      },
      {
        name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
        value: 'token-1',
      },
    ]);

    const { resolveWorkspaceStorageAutoExtractConfig } = await import(
      './workspace-storage-auto-extract'
    );

    await expect(
      resolveWorkspaceStorageAutoExtractConfig('ws-1')
    ).resolves.toEqual({
      configured: true,
      enabled: true,
      proxyToken: 'token-1',
      proxyUrl: 'https://zip-proxy.example.com/extract',
    });
  });
});
