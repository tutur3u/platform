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
    // Docker CLI selectors stay on the trusted host; none are container --env.
    env: Object.fromEntries(
      [
        'PATH',
        'HOME',
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'DOCKER_TLS',
        'DOCKER_TLS_VERIFY',
        'DOCKER_CERT_PATH',
        'DOCKER_API_VERSION',
        'SSH_AUTH_SOCK',
        'XDG_RUNTIME_DIR',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
        'http_proxy',
        'https_proxy',
        'all_proxy',
        'no_proxy',
      ].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]]
      )
    ),
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
