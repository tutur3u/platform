import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
type ProbeOptions = {
  timeout: number;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
};
type ProbeExec = (
  file: string,
  args: string[],
  options: ProbeOptions
) => Promise<{ stdout: string }>;
const run: ProbeExec = async (file, args, options) => {
  const { stdout } = await execute(file, args, {
    ...options,
    encoding: 'utf8',
  });
  return { stdout };
};

// System telemetry never executes a caller-supplied PATH binary or inherits
// loader variables. These locations cover macOS and Linux installations.
export async function systemProbe(
  tool: 'sysctl' | 'ps',
  args: string[],
  options: { timeout: number; maxBuffer?: number },
  exec: ProbeExec = run
) {
  const candidates =
    tool === 'sysctl'
      ? ['/usr/sbin/sysctl', '/sbin/sysctl']
      : ['/bin/ps', '/usr/bin/ps'];
  for (const [index, file] of candidates.entries()) {
    try {
      return await exec(file, args, {
        ...options,
        maxBuffer: options.maxBuffer ?? 64 * 1024,
        env: { LC_ALL: 'C' },
      });
    } catch (error) {
      const missing =
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'EACCES');
      if (!missing || index === candidates.length - 1) throw error;
    }
  }
  throw new Error('No trusted system probe executable.');
}
