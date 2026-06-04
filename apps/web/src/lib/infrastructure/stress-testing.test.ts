import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, serverLoggerWarnMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  serverLoggerWarnMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('./log-drain', () => ({
  ensureLogDrainSchema: vi.fn(),
  getLogDrainSqlClient: vi.fn(() => null),
  serverLogger: {
    warn: serverLoggerWarnMock,
  },
}));

import {
  createQueuedStressTestRun,
  getStressTestingPaths,
  queueStressTestRunFile,
  readStressTestSnapshot,
} from './stress-testing';

describe('infrastructure stress testing helpers', () => {
  let tempDir: string;
  const originalTargets = process.env.PLATFORM_STRESS_TEST_TARGETS;
  const originalControl = process.env.PLATFORM_STRESS_TEST_CONTROL_DIR;
  const originalRuntime = process.env.PLATFORM_STRESS_TEST_MONITORING_DIR;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-testing-'));
    process.env.PLATFORM_STRESS_TEST_CONTROL_DIR = path.join(
      tempDir,
      'control'
    );
    process.env.PLATFORM_STRESS_TEST_MONITORING_DIR = path.join(
      tempDir,
      'runtime'
    );
    process.env.PLATFORM_STRESS_TEST_TARGETS = JSON.stringify([
      {
        baseUrl: 'https://staging.tuturuuu.localhost',
        defaultPath: '/health',
        description: 'Staging',
        id: 'staging',
        label: 'Staging',
      },
    ]);
    createAdminClientMock.mockResolvedValue({
      schema: () => ({
        from: () => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { force: true, recursive: true });
    process.env.PLATFORM_STRESS_TEST_TARGETS = originalTargets;
    process.env.PLATFORM_STRESS_TEST_CONTROL_DIR = originalControl;
    process.env.PLATFORM_STRESS_TEST_MONITORING_DIR = originalRuntime;
    vi.clearAllMocks();
  });

  it('queues only configured allowlisted targets', () => {
    const paths = getStressTestingPaths();
    const run = createQueuedStressTestRun({
      payload: {
        path: '/api/health',
        profileId: 'smoke',
        targetId: 'staging',
      },
      requestedBy: 'user-1',
      requestedByEmail: 'ops@tuturuuu.com',
    });

    queueStressTestRunFile(run, paths);

    const [requestFile] = fs.readdirSync(paths.runRequestsDir);
    expect(requestFile).toContain(run.id);
    const queued = JSON.parse(
      fs.readFileSync(path.join(paths.runRequestsDir, requestFile!), 'utf8')
    );
    expect(queued.run.target.url).toBe(
      'https://staging.tuturuuu.localhost/api/health'
    );
  });

  it('merges queued runtime state into the monitoring snapshot', async () => {
    const run = createQueuedStressTestRun({
      payload: {
        profileId: 'steady',
        targetId: 'staging',
      },
      requestedBy: 'user-1',
      requestedByEmail: 'ops@tuturuuu.com',
    });
    queueStressTestRunFile(run);

    const snapshot = await readStressTestSnapshot({ canManage: true });

    expect(snapshot.canManage).toBe(true);
    expect(snapshot.activeRun?.id).toBe(run.id);
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.targets).toEqual([
      expect.objectContaining({ id: 'staging' }),
    ]);
  });

  it('rejects targets outside the allowlist', () => {
    expect(() =>
      createQueuedStressTestRun({
        payload: {
          profileId: 'smoke',
          targetId: 'production',
        },
        requestedBy: 'user-1',
        requestedByEmail: null,
      })
    ).toThrow('Stress test target is not allowlisted.');
  });
});
