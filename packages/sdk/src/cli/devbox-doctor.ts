import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import {
  createDevboxSetupPlan,
  type DevboxSetupPackageManager,
  type DevboxSetupTool,
} from '@tuturuuu/devbox';

export interface DevboxDoctorReport {
  containerized: true;
  missingTools: DevboxSetupTool[];
  packageManager: DevboxSetupPackageManager | null;
  setupCommands: string[][];
  status: 'needs-setup' | 'ok';
  tools: Record<DevboxSetupTool, string | null>;
}

function getToolVersion(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split('\n')[0]?.trim() || null;
}

function commandExists(command: string) {
  return (
    spawnSync(command, ['--version'], {
      encoding: 'utf8',
      shell: false,
    }).status === 0
  );
}

function detectPackageManager(): DevboxSetupPackageManager | null {
  const currentPlatform = platform();

  if (currentPlatform === 'darwin' && commandExists('brew')) return 'brew';
  if (currentPlatform === 'win32' && commandExists('winget')) return 'winget';

  for (const candidate of ['apt-get', 'dnf', 'pacman'] as const) {
    if (commandExists(candidate)) return candidate;
  }

  return null;
}

export async function createDevboxDoctorReport(): Promise<DevboxDoctorReport> {
  const tools = {
    bun: getToolVersion('bun', ['--version']),
    docker: getToolVersion('docker', ['--version']),
    git: getToolVersion('git', ['--version']),
    node: getToolVersion('node', ['--version']) ?? process.versions.node,
  };
  const missingTools = Object.entries(tools)
    .filter(([, version]) => !version)
    .map(([tool]) => tool as DevboxSetupTool);
  const packageManager = detectPackageManager();
  const setupPlan =
    missingTools.length > 0 && packageManager
      ? createDevboxSetupPlan({
          missingTools,
          packageManager,
          platform: platform(),
        })
      : null;

  return {
    containerized: true,
    missingTools,
    packageManager,
    setupCommands: setupPlan?.commands ?? [],
    status: missingTools.length > 0 ? 'needs-setup' : 'ok',
    tools,
  };
}

function printJson(value: unknown, stdout: (value: string) => void) {
  stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export function printDevboxDoctorReport(
  report: DevboxDoctorReport,
  json: boolean
) {
  if (json) {
    printJson(report, (value) => process.stdout.write(value));
    return;
  }

  process.stdout.write(
    `${[
      'Devbox doctor',
      `Node.js: ${report.tools.node ?? 'missing'}`,
      `Bun: ${report.tools.bun ?? 'missing'}`,
      `Docker: ${report.tools.docker ?? 'missing'}`,
      `Git: ${report.tools.git ?? 'missing'}`,
      'Execution: containerized',
    ].join('\n')}\n`
  );
}
