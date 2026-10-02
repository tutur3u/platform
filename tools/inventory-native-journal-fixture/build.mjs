import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applicationId } from './prepare.mjs';

export function runBuild(platform, destination, execute = spawnSync) {
  applicationId(platform);
  const steps = [
    ['pub_get', ['pub', 'get'], 300_000],
    [
      'build',
      platform === 'android'
        ? ['build', 'apk', '--debug', '--dart-define-from-file=defines.json']
        : [
            'build',
            'ios',
            '--debug',
            '--simulator',
            '--dart-define-from-file=defines.json',
          ],
      600_000,
    ],
  ];
  for (const [stage, args, timeout] of steps) {
    let result;
    try {
      result = execute('flutter', args, {
        cwd: destination,
        timeout,
        stdio: 'ignore',
      });
    } catch {
      result = {};
    }
    const passed = result.status === 0 && !result.error && !result.signal;
    const status = {
      stage,
      passed,
      exit_code: Number.isSafeInteger(result.status) ? result.status : null,
    };
    writeFileSync(
      resolve(destination, 'build-status.json'),
      JSON.stringify(status)
    );
    if (!passed) return status;
  }
  const status = { stage: 'complete', passed: true, exit_code: 0 };
  writeFileSync(
    resolve(destination, 'build-status.json'),
    JSON.stringify(status)
  );
  return status;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [platform, destination] = process.argv.slice(2);
  try {
    const status = runBuild(platform, destination);
    console.log(
      `Fixture build ${status.passed ? 'PASS' : 'FAIL'}: ${status.stage}, exit ${status.exit_code ?? 'unavailable'}`
    );
    if (!status.passed) process.exitCode = 1;
  } catch {
    console.error('Fixture build FAIL: status_write_failed');
    process.exitCode = 1;
  }
}
