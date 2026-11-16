import { spawn } from 'node:child_process';
import { refreshGuardAfterUpgrade } from './git-guard-upgrade';

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
        // The global entry path is stable, so it now holds the new code.
        import('./git-guard-install.js')
          .then(({ defaultEntry }) => refreshGuardAfterUpgrade(defaultEntry()))
          .catch((error: unknown) =>
            process.stderr.write(
              `Warning: ttr git guard refresh failed after upgrade: ${error instanceof Error ? error.message : String(error)}\n`
            )
          )
          .finally(resolve);
        return;
      }

      reject(new Error(`Upgrade failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}
