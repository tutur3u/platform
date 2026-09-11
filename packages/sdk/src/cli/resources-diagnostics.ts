import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { totalmem } from 'node:os';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function memoryPressure() {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await exec(
        'sysctl',
        ['-n', 'kern.memorystatus_vm_pressure_level'],
        { timeout: 2000 }
      );
      const level = Number(stdout.trim());
      return {
        blocked: level >= 2,
        reason: level >= 2 ? 'macOS reports elevated memory pressure' : null,
      };
    }
    if (process.platform === 'linux') {
      const info = await readFile('/proc/meminfo', 'utf8');
      const available =
        Number(/^MemAvailable:\s+(\d+)/m.exec(info)?.[1]) * 1024;
      const blocked =
        Number.isFinite(available) &&
        available < Math.max(1024 ** 3, totalmem() * 0.15);
      return {
        blocked,
        reason: blocked ? 'Linux available memory is below the reserve' : null,
      };
    }
  } catch {
    /* Unsupported telemetry is reported; it does not block every job. */
  }
  return { blocked: false, reason: null };
}

export async function resourceSnapshot() {
  const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,comm='], {
    timeout: 3000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const processes = stdout
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/.exec(line);
      if (!match) return [];
      return [
        {
          pid: Number(match[1]),
          parentPid: Number(match[2]),
          rssMiB: Math.round(Number(match[3]) / 1024),
          cpuPercent: Number(match[4]),
          executable: match[5]!.split('/').pop()!,
        },
      ];
    });
  const t3Pids = new Set(
    processes
      .filter((p) => p.executable.startsWith('T3 Code'))
      .map((p) => p.pid)
  );
  let count = -1;
  while (t3Pids.size !== count) {
    count = t3Pids.size;
    for (const process of processes)
      if (t3Pids.has(process.parentPid)) t3Pids.add(process.pid);
  }
  return {
    at: new Date().toISOString(),
    pressure: await memoryPressure(),
    t3ResidentMiB: processes
      .filter((p) => t3Pids.has(p.pid))
      .reduce((total, p) => total + p.rssMiB, 0),
    topProcesses: processes.sort((a, b) => b.rssMiB - a.rssMiB).slice(0, 12),
    note: 'Resident memory is not Activity Monitor memory footprint; shared pages may be counted more than once. Command arguments and environment values are omitted.',
  };
}
