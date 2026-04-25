import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBlueGreenDeploymentPin,
  readBlueGreenDeploymentPin,
  writeBlueGreenDeploymentPin,
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
});
