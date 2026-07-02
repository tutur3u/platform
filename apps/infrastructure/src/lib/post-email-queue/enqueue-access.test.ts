import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POST_EMAIL_SEND_PERMISSION,
  POST_EMAIL_SENDING_SECRET,
  resolvePostEmailEnqueueAccess,
} from './enqueue-access';

const mocks = vi.hoisted(() => ({
  verifySecret: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: (...args: Parameters<typeof mocks.verifySecret>) =>
    mocks.verifySecret(...args),
}));

function permissions(granted: string[]) {
  const permissionSet = new Set(granted);
  return {
    withoutPermission: (permission: string) => !permissionSet.has(permission),
  };
}

describe('resolvePostEmailEnqueueAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies enqueue before reading secrets when the caller cannot send post emails', async () => {
    await expect(
      resolvePostEmailEnqueueAccess({
        permissions: permissions([]),
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      allowed: false,
      reason: 'missing_send_permission',
    });

    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it('denies enqueue when workspace email sending is disabled', async () => {
    mocks.verifySecret.mockResolvedValue(false);

    await expect(
      resolvePostEmailEnqueueAccess({
        permissions: permissions([POST_EMAIL_SEND_PERMISSION]),
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      allowed: false,
      reason: 'email_sending_disabled',
    });

    expect(mocks.verifySecret).toHaveBeenCalledWith({
      forceAdmin: true,
      name: POST_EMAIL_SENDING_SECRET,
      value: 'true',
      wsId: 'ws-1',
    });
  });

  it('allows enqueue only when the caller can send and the workspace flag is enabled', async () => {
    mocks.verifySecret.mockResolvedValue(true);

    await expect(
      resolvePostEmailEnqueueAccess({
        permissions: permissions([POST_EMAIL_SEND_PERMISSION]),
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ allowed: true });
  });
});
