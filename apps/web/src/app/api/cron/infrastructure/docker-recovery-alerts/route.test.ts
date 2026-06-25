import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readAlertState: vi.fn(),
  readSnapshot: vi.fn(),
  sendSystemEmail: vi.fn(),
  writeAlertState: vi.fn(),
}));

vi.mock('@tuturuuu/email-service', () => ({
  sendSystemEmail: mocks.sendSystemEmail,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringSnapshot: mocks.readSnapshot,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  readBlueGreenDockerRecoveryAlertState: mocks.readAlertState,
  writeBlueGreenDockerRecoveryAlertState: mocks.writeAlertState,
}));

import { findPendingDockerRecoveryIncidents, GET } from './route';

function createRequest(secret = 'cron-secret') {
  return new Request(
    'http://localhost/api/cron/infrastructure/docker-recovery-alerts',
    {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    }
  );
}

function createSnapshot() {
  const now = Date.now();

  return {
    control: {
      dockerRecoverySettings: {
        dockerRecoveryPollMs: 5000,
        dockerRecoveryTimeoutMs: null,
        dockerProbeTimeoutMs: 10_000,
        dockerRestartAfterMs: 30_000,
        dockerRestartCommand: null,
        dockerRestartCooldownMs: 300_000,
        dockerRestartDisabled: false,
        emailAlertCooldownMs: 1,
        emailAlertRecipients: ['ops@platform.test'],
        emailAlertsEnabled: true,
        kind: 'docker-recovery-settings',
        postRestartCommandTimeoutMs: 600_000,
        postRestartCommands: [],
        updatedAt: null,
        updatedBy: null,
        updatedByEmail: null,
      },
    },
    watcher: {
      logs: [
        {
          activeColor: null,
          commitHash: null,
          commitShortHash: null,
          deploymentKey: null,
          deploymentKind: 'docker-daemon-recovery',
          deploymentStamp: null,
          deploymentStatus: null,
          eventId: 'incident-1:docker-daemon-recovered:2000',
          eventType: 'docker-daemon-recovered',
          incidentId: 'incident-1',
          level: 'info',
          message: 'Docker daemon recovered after 2s.',
          time: now - 1000,
        },
        {
          activeColor: null,
          commitHash: null,
          commitShortHash: null,
          deploymentKey: null,
          deploymentKind: 'docker-daemon-recovery',
          deploymentStamp: null,
          deploymentStatus: null,
          eventId: 'incident-1:docker-daemon-restart-result:1500',
          eventType: 'docker-daemon-restart-result',
          incidentId: 'incident-1',
          level: 'info',
          message: 'Docker daemon restart command completed.',
          time: now - 1500,
        },
        {
          activeColor: null,
          commitHash: null,
          commitShortHash: null,
          deploymentKey: null,
          deploymentKind: 'docker-daemon-recovery',
          deploymentStamp: null,
          deploymentStatus: null,
          eventId: 'incident-1:docker-daemon-unresponsive:1000',
          eventType: 'docker-daemon-unresponsive',
          incidentId: 'incident-1',
          level: 'error',
          message: 'Docker daemon probe timed out.',
          time: now - 2000,
        },
      ],
    },
  };
}

describe('Docker recovery alert cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('groups pending Docker recovery logs by incident id', () => {
    const incidents = findPendingDockerRecoveryIncidents({
      logs: createSnapshot().watcher.logs,
      minimumTime: 0,
      notifiedIncidentIds: [],
    });

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.id).toBe('incident-1');
    expect(incidents[0]?.summary.eventType).toBe('docker-daemon-recovered');
  });

  it('sends one SES-backed email and records notified incidents', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.readSnapshot.mockReturnValue(createSnapshot());
    mocks.readAlertState.mockReturnValue({
      kind: 'docker-recovery-alert-state',
      lastCheckedAt: null,
      lastSentAt: null,
      notifiedIncidentIds: [],
      updatedAt: null,
    });
    mocks.writeAlertState.mockImplementation((state) => ({
      ...state,
      kind: 'docker-recovery-alert-state',
      updatedAt: '2026-05-17T10:00:00.000Z',
    }));
    mocks.sendSystemEmail.mockResolvedValue({ success: true });

    const response = await GET(createRequest() as NextRequest);

    expect(response.status).toBe(200);
    expect(mocks.sendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject: expect.stringContaining('Docker recovered'),
          text: expect.stringContaining(
            'Docker daemon restart command completed.'
          ),
        }),
        recipients: { to: ['ops@platform.test'] },
      })
    );
    expect(mocks.writeAlertState).toHaveBeenCalledWith(
      expect.objectContaining({
        notifiedIncidentIds: ['incident-1'],
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sent: 1,
    });
  });

  it('does not send duplicate emails for notified incidents', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.readSnapshot.mockReturnValue(createSnapshot());
    mocks.readAlertState.mockReturnValue({
      kind: 'docker-recovery-alert-state',
      lastCheckedAt: null,
      lastSentAt: null,
      notifiedIncidentIds: ['incident-1'],
      updatedAt: null,
    });

    const response = await GET(createRequest() as NextRequest);

    expect(response.status).toBe(200);
    expect(mocks.sendSystemEmail).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: 'no-incidents',
    });
  });
});
