import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBlueGreenDeploymentPin,
  queueBlueGreenDeploymentRevertRequest,
  readBlueGreenDeploymentPin,
  readBlueGreenDeploymentRevertRequest,
  readBlueGreenDockerRecoveryAlertState,
  readBlueGreenDockerRecoverySettings,
  writeBlueGreenDeploymentPin,
  writeBlueGreenDockerRecoveryAlertState,
  writeBlueGreenDockerRecoverySettings,
} from './blue-green-monitoring-controls';

const ORIGINAL_CONTROL_DIR = process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR;

describe('blue-green monitoring controls', () => {
  afterEach(() => {
    if (ORIGINAL_CONTROL_DIR === undefined) {
      delete process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR;
      return;
    }

    process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = ORIGINAL_CONTROL_DIR;
  });

  it('persists and clears deployment pins in the watcher control directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blue-green-pin-'));

    try {
      process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = tempDir;

      const pin = writeBlueGreenDeploymentPin({
        activeColor: 'green',
        commitHash: 'old123456789',
        commitShortHash: 'old1234',
        commitSubject: 'Known good deployment',
        deploymentStamp: 'deploy-2026-04-20T10-00-00Z',
        requestedAt: '2026-04-23T10:00:00.000Z',
        requestedBy: 'user-1',
        requestedByEmail: 'ops@platform.test',
      });

      expect(pin).toMatchObject({
        activeColor: 'green',
        commitHash: 'old123456789',
        kind: 'deployment-pin',
      });
      expect(readBlueGreenDeploymentPin()).toMatchObject({
        commitHash: 'old123456789',
        requestedBy: 'user-1',
      });

      clearBlueGreenDeploymentPin();

      expect(readBlueGreenDeploymentPin()).toBeNull();
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('persists deployment revert requests', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-revert-')
    );

    try {
      process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = tempDir;

      const revert = queueBlueGreenDeploymentRevertRequest({
        commitHash: 'old123456789',
        commitShortHash: 'old1234',
        commitSubject: 'Known good deployment',
        deploymentStamp: 'deploy-old',
        imageTag: 'platform-web-cache:old1234',
        instant: true,
        requestedAt: '2026-06-10T10:05:00.000Z',
        requestedBy: 'user-2',
        requestedByEmail: null,
      });

      expect(revert).toMatchObject({
        commitHash: 'old123456789',
        instant: true,
        kind: 'deployment-revert',
      });
      expect(readBlueGreenDeploymentRevertRequest()).toMatchObject({
        commitShortHash: 'old1234',
        imageTag: 'platform-web-cache:old1234',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('persists Docker recovery settings without web-controlled command hooks', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-recovery-settings-')
    );

    try {
      process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = tempDir;

      const settings = writeBlueGreenDockerRecoverySettings({
        dockerRecoveryPollMs: 1000,
        dockerRecoveryTimeoutMs: null,
        dockerProbeTimeoutMs: 2500,
        dockerRestartAfterMs: 5000,
        dockerRestartCommand: ['service', 'docker', 'restart'],
        dockerRestartCooldownMs: 60_000,
        dockerRestartDisabled: false,
        emailAlertCooldownMs: 900_000,
        emailAlertRecipients: [
          'Ops@Platform.Test',
          'bad-email',
          `${'a'.repeat(100_000)}!@invalid`,
        ],
        emailAlertsEnabled: true,
        postRestartCommandTimeoutMs: 120_000,
        postRestartCommands: [
          {
            args: ['compose', 'up', '-d'],
            command: 'docker',
            cwd: '/srv/zeus',
          },
        ],
        updatedAt: '2026-05-17T09:30:00.000Z',
        updatedBy: 'user-1',
        updatedByEmail: 'ops@platform.test',
      });

      expect(settings).toMatchObject({
        dockerRestartCommand: null,
        emailAlertRecipients: ['ops@platform.test'],
        emailAlertsEnabled: true,
        kind: 'docker-recovery-settings',
        postRestartCommands: [],
      });
      expect(readBlueGreenDockerRecoverySettings()).toMatchObject({
        dockerRestartAfterMs: 5000,
        dockerRestartCommand: null,
        dockerProbeTimeoutMs: 2500,
        emailAlertCooldownMs: 900_000,
        postRestartCommands: [],
        postRestartCommandTimeoutMs: 120_000,
        updatedBy: 'user-1',
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('persists Docker recovery email alert state for incident dedupe', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'blue-green-recovery-alert-state-')
    );

    try {
      process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = tempDir;

      const state = writeBlueGreenDockerRecoveryAlertState({
        lastCheckedAt: '2026-05-17T10:00:00.000Z',
        lastSentAt: '2026-05-17T10:00:00.000Z',
        notifiedIncidentIds: ['incident-1', 'incident-1', 'incident-2'],
        updatedAt: '2026-05-17T10:00:01.000Z',
      });

      expect(state).toMatchObject({
        kind: 'docker-recovery-alert-state',
        notifiedIncidentIds: ['incident-1', 'incident-2'],
      });
      expect(readBlueGreenDockerRecoveryAlertState()).toMatchObject({
        lastSentAt: '2026-05-17T10:00:00.000Z',
        notifiedIncidentIds: ['incident-1', 'incident-2'],
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
