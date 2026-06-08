import { spawn } from 'node:child_process';

export interface DevboxSetupCommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

export type DevboxSetupCommandRunner = (
  command: string,
  args: string[],
  options: {
    capture?: boolean;
    cwd?: string;
    json?: boolean;
    redactOutput?: boolean;
  }
) => Promise<DevboxSetupCommandResult>;

export function formatDevboxSetupCommand(command: string, args: string[]) {
  return [command, ...args].join(' ');
}

export function redactDevboxSetupOutput(value: string) {
  return value
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED]'
    )
    .replace(/\bpostgres(?:ql)?:\/\/[^\s|│]+/gi, '[REDACTED]')
    .replace(
      /((?:anon|service_role|service role|jwt secret|publishable|access|secret|s3 access|s3 secret)\s*(?:key|token|secret)?\s*[:|│]\s*)[^\s|│]+/gi,
      '$1[REDACTED]'
    );
}

export async function defaultDevboxSetupRunCommand(
  command: string,
  args: string[],
  options: {
    capture?: boolean;
    cwd?: string;
    json?: boolean;
    redactOutput?: boolean;
  } = {}
): Promise<DevboxSetupCommandResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const value = String(chunk);
      stdout += value;
      if (!options.capture && !options.redactOutput) {
        (options.json ? process.stderr : process.stdout).write(value);
      }
    });
    child.stderr.on('data', (chunk) => {
      const value = String(chunk);
      stderr += value;
      if (!options.capture && !options.redactOutput)
        process.stderr.write(value);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (!options.capture && options.redactOutput) {
        const stream = options.json ? process.stderr : process.stdout;
        if (stdout) stream.write(redactDevboxSetupOutput(stdout));
        if (stderr) process.stderr.write(redactDevboxSetupOutput(stderr));
      }
      resolveCommand({
        code: code ?? 1,
        stderr,
        stdout,
      });
    });
  });
}
