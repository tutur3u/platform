import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  normalizeBlueGreenDockerRecoverySettingsMock,
  writeBlueGreenDockerRecoverySettingsMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  normalizeBlueGreenDockerRecoverySettingsMock: vi.fn(),
  writeBlueGreenDockerRecoverySettingsMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  normalizeBlueGreenDockerRecoverySettings:
    normalizeBlueGreenDockerRecoverySettingsMock,
  writeBlueGreenDockerRecoverySettings:
    writeBlueGreenDockerRecoverySettingsMock,
}));

import { PATCH } from './route';

function createTestRequest(body?: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/recovery-settings',
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  ) as NextRequest;
}

describe('blue-green recovery-settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authorization response when access is denied', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await PATCH(createTestRequest({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('persists Docker recovery settings for authorized operators', async () => {
    const normalizedSettings = {
      dockerRecoveryPollMs: 1000,
      dockerRecoveryTimeoutMs: null,
      dockerRestartAfterMs: 5000,
      dockerRestartCommand: null,
      dockerRestartCooldownMs: 60_000,
      dockerRestartDisabled: false,
      emailAlertCooldownMs: 900_000,
      emailAlertRecipients: ['ops@platform.test'],
      emailAlertsEnabled: true,
      kind: 'docker-recovery-settings',
      postRestartCommandTimeoutMs: 120_000,
      postRestartCommands: [],
      updatedAt: null,
      updatedBy: null,
      updatedByEmail: null,
    };
    const savedSettings = {
      ...normalizedSettings,
      updatedAt: '2026-05-17T09:30:00.000Z',
      updatedBy: 'user-1',
      updatedByEmail: 'ops@platform.test',
    };
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    normalizeBlueGreenDockerRecoverySettingsMock.mockReturnValue(
      normalizedSettings
    );
    writeBlueGreenDockerRecoverySettingsMock.mockReturnValue(savedSettings);

    const response = await PATCH(
      createTestRequest({
        dockerRestartAfterMs: 5000,
      })
    );

    expect(response.status).toBe(200);
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledWith(
      expect.any(Request)
    );
    expect(writeBlueGreenDockerRecoverySettingsMock).toHaveBeenCalledWith({
      ...normalizedSettings,
      updatedBy: 'user-1',
      updatedByEmail: 'ops@platform.test',
    });
    await expect(response.json()).resolves.toMatchObject({
      message: 'Updated Docker recovery settings.',
      settings: {
        updatedBy: 'user-1',
      },
    });
  });
});
