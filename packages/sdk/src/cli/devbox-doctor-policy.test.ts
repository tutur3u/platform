import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDevboxDoctorReport,
  printDevboxDoctorReport,
} from './devbox-doctor';
import { runDevboxSetup } from './devbox-setup';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: () => ({ status: 0, stdout: 'fixture-version', stderr: '' }),
}));

describe('execution policy diagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it('reports invalid environment policy without claiming trusted execution', async () => {
    vi.stubEnv('TUTURUUU_DEVBOX_EXECUTION_MODE', 'unknown');
    const report = await createDevboxDoctorReport();
    expect(report.status).toBe('needs-setup');
    expect(report.executionMode).toBeUndefined();
    expect(report.executionPolicyError).toContain(
      'TUTURUUU_DEVBOX_EXECUTION_MODE'
    );
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    printDevboxDoctorReport(report, false);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('Execution: invalid policy')
    );
  });
  it('reports the invalid policy during setup before issuing host commands', async () => {
    vi.stubEnv('TUTURUUU_DEVBOX_EXECUTION_MODE', 'unknown');
    const report = await createDevboxDoctorReport();
    const runCommand = vi.fn();
    const previousExitCode = process.exitCode;
    try {
      expect(
        await runDevboxSetup({
          doctorReport: report,
          json: true,
          stdout: () => {},
          runCommand,
        })
      ).toBe(report);
      expect(process.exitCode).toBe(1);
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
