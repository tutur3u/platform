const { execFileSync } = require('node:child_process');
const { parseCurlOutput } = require('./verify-staged-critical-app');

const BUILD_INFO_URL = 'https://meet.tuturuuu.com/api/build-info';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
// Seconds to wait before each retry. The sum bounds the propagation window
// that tolerates only the previous live commit.
const RETRY_DELAYS_SECONDS = [3, 3, 5, 5, 8, 8, 10, 10, 15, 15, 15, 15];
const PROBE_WINDOW_MS = 120_000;
const HEADER_ALLOWLIST = [
  'age',
  'cache-control',
  'cf-cache-status',
  'cf-ray',
  'date',
];

function allowlistedHeaders(block) {
  const headers = {};
  for (const line of block.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (HEADER_ALLOWLIST.includes(name) && /^[\w ,;=.:+/-]{1,80}$/.test(value))
      headers[name] = value;
  }
  return headers;
}

function splitResponse(raw) {
  let headers = {};
  let rest = raw;
  // Interim (1xx) or proxy responses precede the final header block.
  while (rest.startsWith('HTTP/')) {
    const match = /\r?\n\r?\n/.exec(rest);
    if (!match) break;
    headers = allowlistedHeaders(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
  }
  return { headers, body: rest };
}

function identityDiagnostic(metadata, sha) {
  const expected = {
    appName: 'meet',
    commitHash: sha,
    environment: 'production',
    refName: 'production',
  };
  const classify = (value, allowed) =>
    allowed.includes(value) ? value : 'unrecognized';
  const observed = {
    appName: classify(metadata?.appName, ['meet', 'web']),
    commitHash:
      typeof metadata?.commitHash === 'string' &&
      /^[a-f0-9]{40}$/.test(metadata.commitHash)
        ? metadata.commitHash
        : 'unrecognized',
    environment: classify(metadata?.environment, [
      'production',
      'preview',
      'local',
    ]),
    refName: classify(metadata?.refName, [
      'production',
      'main',
      'ci-fixture',
      'local',
    ]),
  };
  return JSON.stringify({
    expected,
    observed,
    mismatches: Object.keys(expected).filter(
      (key) => metadata?.[key] !== expected[key]
    ),
  });
}
function verifyMeetBuildInfo({ sha, status, body, previousLive }) {
  if (!SHA_PATTERN.test(sha ?? ''))
    throw new Error('A full source SHA is required');
  if (status !== 200) {
    const diagnostic =
      Number.isInteger(status) && status >= 100 && status <= 599
        ? String(status)
        : 'unavailable';
    throw new Error(
      `Meet build identity HTTP probe failed (status ${diagnostic})`
    );
  }
  let metadata;
  try {
    metadata = JSON.parse(body);
  } catch {
    throw new Error('Meet build identity probe expected JSON');
  }
  const stable =
    metadata?.appName === 'meet' &&
    metadata?.environment === 'production' &&
    metadata?.refName === 'production';
  // Only the previously live commit may be observed while the new version
  // propagates; any other mismatch is a hard failure.
  if (
    stable &&
    metadata.commitHash !== sha &&
    SHA_PATTERN.test(previousLive ?? '') &&
    previousLive !== sha &&
    metadata.commitHash === previousLive
  )
    return 'pending';
  if (!stable || metadata?.commitHash !== sha)
    throw new Error(
      `Meet canonical build identity does not match the production candidate: ${identityDiagnostic(metadata, sha)}`
    );
  return 'verified';
}

function requestBuildInfo(runCommand = execFileSync, attempt = 0) {
  try {
    const stdout = runCommand(
      'curl',
      [
        '--silent',
        '--show-error',
        '--include',
        '--max-time',
        '20',
        '--write-out',
        '\nTTR_HTTP_STATUS:%{http_code}',
        `${BUILD_INFO_URL}?ttr_probe=${attempt}`,
      ],
      {
        encoding: 'utf8',
        timeout: 25000,
        maxBuffer: 64 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const { status, body } = parseCurlOutput(stdout);
    return { status, ...splitResponse(body) };
  } catch {
    // Do not print a response body or arbitrary transport diagnostics.
    throw new Error('Meet canonical build identity probe could not complete');
  }
}

const realSleep = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function main({
  env = process.env,
  request = requestBuildInfo,
  sleep = realSleep,
  now = Date.now,
  log = console.log,
} = {}) {
  const sha = env.GITHUB_SHA;
  if (!SHA_PATTERN.test(sha ?? ''))
    throw new Error('A full source SHA is required');
  const previousLive = SHA_PATTERN.test(env.MEET_PREVIOUS_LIVE_SHA ?? '')
    ? env.MEET_PREVIOUS_LIVE_SHA
    : undefined;
  const deadline = now() + PROBE_WINDOW_MS;
  for (let attempt = 0; ; attempt++) {
    const { headers = {}, ...response } = request(undefined, attempt);
    const outcome = verifyMeetBuildInfo({ sha, previousLive, ...response });
    log(
      `Meet build identity attempt ${attempt + 1}: ${outcome} ${JSON.stringify({ status: response.status, headers })}`
    );
    if (outcome === 'verified') {
      console.log('Verified canonical Meet production build identity.');
      return;
    }
    const delay = RETRY_DELAYS_SECONDS[attempt];
    if (delay === undefined || now() + delay * 1000 > deadline)
      throw new Error(
        'Meet canonical build identity still served the previous live commit after the propagation window'
      );
    await sleep(delay);
  }
}
module.exports = {
  BUILD_INFO_URL,
  PROBE_WINDOW_MS,
  RETRY_DELAYS_SECONDS,
  main,
  requestBuildInfo,
  verifyMeetBuildInfo,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
