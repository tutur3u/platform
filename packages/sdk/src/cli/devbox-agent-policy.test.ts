import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDevboxCommandWithSession } from './devbox-session';

describe('local execution policy capability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it('reports local execution policy without a login', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    vi.stubEnv('TUTURUUU_DEVBOX_EXECUTION_MODE', 'judge-only');
    await runDevboxCommandWithSession({
      action: 'agent',
      firstId: 'policy',
      baseUrl: 'https://example.test',
      hasSession: false,
      createClient: () => {
        throw new Error('Policy diagnostics must not require login');
      },
      argv: ['box', 'agent', 'policy'],
      flags: {},
      json: true,
    });
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"executionMode": "judge-only"')
    );
  });
});
