const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const workspace = '00000000-0000-4000-8000-000000000001';
const READS = {
  platform: [
    `/api/v1/workspaces/${workspace}/wallets`,
    '/api/v1/exchange-rates',
  ],
  finance: [
    `/api/workspaces/${workspace}/wallets/infinite`,
    '/api/v1/exchange-rates',
  ],
  inventory: [`/api/v1/workspaces/${workspace}/inventory/products`],
  contacts: [`/api/v1/workspaces/${workspace}/users/database`],
  cms: ['/api/v1/admin/external-projects'],
  tasks: ['/api/v1/users/me/tasks'],
};
const marker = '\nTTR_HTTP_STATUS:';
function parseCurlOutput(stdout) {
  const end = stdout.lastIndexOf(marker);
  if (end < 0)
    throw new Error('Deployment probe did not return an HTTP status');
  const status = Number(stdout.slice(end + marker.length).trim());
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new Error('Invalid deployment probe HTTP status');
  return { status, body: stdout.slice(0, end) };
}
function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      'Deployment probe expected JSON, received another response format'
    );
  }
}
async function verifyStagedApp({ app, sha, request }) {
  if (!READS[app]) throw new Error('Unsupported critical app');
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error('A full source SHA is required');
  const stamp = await request('/api/build-info', 'GET');
  if (stamp.status !== 200)
    throw new Error(`Build identity probe failed (${stamp.status})`);
  const metadata = parseJson(stamp.body);
  if (
    metadata.commitHash !== sha ||
    metadata.appName !== (app === 'platform' ? 'web' : app) ||
    metadata.environment !== 'production'
  ) {
    throw new Error(
      'Staged deployment identity does not match the production candidate'
    );
  }
  for (const path of READS[app]) {
    // Deliberately invalid machine-key probes cannot read customer data. They must
    // cross satellite session refresh to reach the real shared proxy and API's
    // normal auth boundary, rather than fail in optional download protection.
    for (const method of ['GET', 'HEAD']) {
      const result = await request(path, method);
      if (result.status !== 401)
        throw new Error(
          `${app} ${method} auth-boundary probe failed (${result.status})`
        );
      if (method === 'GET') {
        const payload = parseJson(result.body);
        if (typeof (payload.error ?? payload.message) !== 'string')
          throw new Error(
            `${app} GET did not return the API authentication envelope`
          );
      }
    }
  }
}
function curlArguments(path, method, url) {
  const args = [
    'curl',
    path,
    '--deployment',
    url,
    '--',
    '--header',
    'Authorization: Bearer ttr_invalid_rollout_canary',
    '--silent',
    '--show-error',
    '--max-time',
    '20',
    '--write-out',
    `${marker}%{http_code}`,
  ];
  if (method === 'HEAD') args.push('--head');
  return args;
}
async function main() {
  const {
    VERCEL_STAGED_DEPLOYMENT_URL: url,
    VERCEL_STAGED_APP: app,
    GITHUB_SHA: sha,
    VERCEL_TOKEN: token,
  } = process.env;
  if (!url || !/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/.test(url) || !token)
    throw new Error('A staged Vercel URL and authenticated CLI are required');
  await verifyStagedApp({
    app,
    sha,
    request: async (path, method) => {
      const args = curlArguments(path, method, url);
      try {
        const { stdout } = await run('vercel', args, {
          timeout: 45000,
          maxBuffer: 128 * 1024,
        });
        return parseCurlOutput(stdout);
      } catch {
        throw new Error(`Staged ${app} ${method} probe could not complete`);
      }
    },
  });
  console.log(
    `Verified staged ${app} source identity and ordinary API auth boundaries.`
  );
}
module.exports = { READS, curlArguments, parseCurlOutput, verifyStagedApp };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
