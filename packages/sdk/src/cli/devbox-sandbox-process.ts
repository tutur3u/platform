import { spawn } from 'node:child_process';
export async function sandboxDocker(
  args: string[],
  input = '',
  timeoutMs = 15000,
  maxBytes = 4 * 1024 * 1024
) {
  const child = spawn('docker', args, {
    shell: false,
    stdio: 'pipe',
    env: { PATH: process.env.PATH },
  });
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  let bytes = 0;
  let exceeded = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  const collect = (target: Buffer[]) => (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      exceeded = true;
      child.kill('SIGKILL');
      return;
    }
    target.push(chunk);
  };
  child.stdout.on('data', collect(chunks));
  child.stderr.on('data', collect(errors));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (value) => resolve(value ?? 1));
    });
    return {
      code,
      output: Buffer.concat(chunks).toString('utf8'),
      stderr: Buffer.concat(errors).toString('utf8'),
      timedOut,
      exceeded,
    };
  } finally {
    clearTimeout(timer);
  }
}
