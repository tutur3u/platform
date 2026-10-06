const { execFileSync } = require('node:child_process');
const { parseCurlOutput } = require('./verify-staged-critical-app');

const BUILD_INFO_URL = 'https://meet.tuturuuu.com/api/build-info';
function verifyMeetBuildInfo({ sha, status, body }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('A full source SHA is required');
  if (status !== 200) throw new Error('Meet build identity HTTP probe failed');
  let metadata;
  try {
    metadata = JSON.parse(body);
  } catch {
    throw new Error('Meet build identity probe expected JSON');
  }
  if (
    metadata?.appName !== 'meet' ||
    metadata?.commitHash !== sha ||
    metadata?.environment !== 'production' ||
    metadata?.refName !== 'production'
  )
    throw new Error(
      'Meet canonical build identity does not match the production candidate'
    );
}

function requestBuildInfo(runCommand = execFileSync) {
  try {
    const stdout = runCommand(
      'curl',
      [
        '--silent',
        '--show-error',
        '--max-time',
        '20',
        '--write-out',
        '\nTTR_HTTP_STATUS:%{http_code}',
        BUILD_INFO_URL,
      ],
      {
        encoding: 'utf8',
        timeout: 25000,
        maxBuffer: 64 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    return parseCurlOutput(stdout);
  } catch {
    // Do not print a response body or arbitrary transport diagnostics.
    throw new Error('Meet canonical build identity probe could not complete');
  }
}

function main({ env = process.env, request = requestBuildInfo } = {}) {
  const sha = env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('A full source SHA is required');
  verifyMeetBuildInfo({ sha, ...request() });
  console.log('Verified canonical Meet production build identity.');
}
module.exports = {
  BUILD_INFO_URL,
  main,
  requestBuildInfo,
  verifyMeetBuildInfo,
};
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
