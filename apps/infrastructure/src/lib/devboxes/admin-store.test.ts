import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  setDevboxRunnerFeature,
  setDevboxRunnerHeartbeatEnabled,
  setDevboxRunnerResourceLimits,
} from './admin-store';

describe('devbox admin store', () => {
  const fromMock = vi.fn();
  const runnerEqMock = vi.fn();
  const runnerLimitMock = vi.fn();
  const runnerSelectMock = vi.fn();
  const runnerUpdateEqMock = vi.fn();
  const runnerUpdateMock = vi.fn();
  const schemaMock = vi.fn();
  const rpcMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    runnerLimitMock.mockResolvedValue({
      data: [{ status: 'online' }],
      error: null,
    });
    runnerEqMock.mockReturnValue({ limit: runnerLimitMock });
    runnerSelectMock.mockReturnValue({ eq: runnerEqMock });
    runnerUpdateEqMock.mockResolvedValue({ error: null });
    runnerUpdateMock.mockReturnValue({ eq: runnerUpdateEqMock });
    fromMock.mockImplementation((table: string) => {
      if (table === 'devbox_runners') {
        return {
          select: runnerSelectMock,
          update: runnerUpdateMock,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpcMock.mockResolvedValue({ data: { build: false }, error: null });
    createAdminClientMock.mockResolvedValue({
      schema: schemaMock,
    });
    schemaMock.mockReturnValue({ from: fromMock, rpc: rpcMock });
  });

  it('enables runner heartbeat without changing runner status', async () => {
    await expect(
      setDevboxRunnerHeartbeatEnabled('runner-1', true)
    ).resolves.toEqual({
      message: 'Devbox runner runner-1 heartbeat enabled.',
    });

    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(runnerSelectMock).toHaveBeenCalledWith('status');
    expect(runnerEqMock).toHaveBeenCalledWith('id', 'runner-1');
    expect(runnerUpdateMock).toHaveBeenCalledWith({
      heartbeat_enabled: true,
      updated_at: expect.any(String),
    });
    expect(runnerUpdateEqMock).toHaveBeenCalledWith('id', 'runner-1');
  });

  it('disables runner heartbeat and returns non-revoked runners to registered', async () => {
    await expect(
      setDevboxRunnerHeartbeatEnabled('runner-1', false)
    ).resolves.toEqual({
      message: 'Devbox runner runner-1 heartbeat disabled.',
    });

    expect(runnerUpdateMock).toHaveBeenCalledWith({
      heartbeat_enabled: false,
      status: 'registered',
      updated_at: expect.any(String),
    });
  });

  it('does not un-revoke a revoked runner when disabling heartbeat', async () => {
    runnerLimitMock.mockResolvedValue({
      data: [{ status: 'revoked' }],
      error: null,
    });

    await setDevboxRunnerHeartbeatEnabled('runner-1', false);

    expect(runnerUpdateMock).toHaveBeenCalledWith({
      heartbeat_enabled: false,
      updated_at: expect.any(String),
    });
  });

  it('updates one runner feature atomically through the private RPC', async () => {
    await setDevboxRunnerFeature('runner-1', 'build', false);

    expect(rpcMock).toHaveBeenCalledWith('set_devbox_runner_feature', {
      p_enabled: false,
      p_feature: 'build',
      p_runner_id: 'runner-1',
    });
  });

  it('saves runner resource limits through the private RPC', async () => {
    const limits = {
      max_cpu_percent: 50,
      max_memory_percent: 25,
      max_sandboxes: 1,
      max_instances: 1,
      sandbox_memory_mb: 256,
      sandbox_timeout_seconds: 10,
      sandbox_pids: 64,
    };
    await setDevboxRunnerResourceLimits('runner-1', limits);

    expect(rpcMock).toHaveBeenCalledWith('set_devbox_runner_resource_limits', {
      p_limits: limits,
      p_runner_id: 'runner-1',
    });
  });
});
