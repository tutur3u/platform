import { spawn } from 'node:child_process';

export function upgradeCli() {
  process.stdout.write('Upgrading Tuturuuu CLI with Bun...\n');

  return new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['i', '-g', 'tuturuuu'], {
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Upgrade failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}
