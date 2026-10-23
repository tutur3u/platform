#!/usr/bin/env node
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const API = 'https://api.github.com';
const SCOPES = new Set([
  'contents',
  'pull_requests',
  'issues',
  'actions',
  'metadata',
]);

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0)
    throw new Error('Use --permissions scope=level -- gh|git <arguments>');
  const options = argv.slice(0, separator);
  if (options.length !== 2 || options[0] !== '--permissions') {
    throw new Error('Specify exactly --permissions scope=level,... before --');
  }
  const permissions = { metadata: 'read' };
  for (const entry of options[1].split(',')) {
    const [scope, level, extra] = entry.split('=');
    if (
      !SCOPES.has(scope) ||
      !['read', 'write'].includes(level) ||
      extra ||
      (scope === 'metadata' && level !== 'read')
    )
      throw new Error('Invalid permission scope or level');
    permissions[scope] = level;
  }
  const command = argv.slice(separator + 1);
  if (
    !(command[0] === 'git' && command[1] === 'push') &&
    !(command[0] === 'gh' && command[1] === 'pr' && command[2] === 'create')
  ) {
    throw new Error('Only git push and gh pr create are supported');
  }
  return { permissions, command };
}

function loadPrivateKey(env, read = execFileSync) {
  if (env.TUTURUUU_BOT_PRIVATE_KEY || env.TUTURUUU_BOT_PRIVATE_KEY_PATH) {
    throw new Error(
      'Inline and file private keys are forbidden; use macOS Keychain'
    );
  }
  return read(
    '/usr/bin/security',
    ['find-generic-password', '-s', 'tuturuuu-bot-private-key', '-w'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    }
  );
}

function createAppJwt(
  appId,
  key,
  now = Math.floor(Date.now() / 1000),
  sign = crypto.sign
) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: now - 60,
    exp: now + 540,
    iss: appId,
  })}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
}

async function request(endpoint, bearer, method, body, fetchImpl) {
  return fetchImpl(`${API}${endpoint}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function runCli(
  argv = process.argv.slice(2),
  {
    env = process.env,
    read = execFileSync,
    sign = crypto.sign,
    fetchImpl = globalThis.fetch,
    spawn = spawnSync,
    stderr = process.stderr,
  } = {}
) {
  let token;
  let code = 1;
  try {
    const { permissions, command } = parseArgs(argv);
    const appId = env.TUTURUUU_BOT_APP_ID;
    const installationId = env.TUTURUUU_BOT_INSTALLATION_ID;
    if (!/^\d+$/.test(appId || '') || !/^\d+$/.test(installationId || '')) {
      throw new Error(
        'Set numeric TUTURUUU_BOT_APP_ID and TUTURUUU_BOT_INSTALLATION_ID'
      );
    }
    const key = loadPrivateKey(env, read);
    const jwt = createAppJwt(appId, key, undefined, sign);
    const response = await request(
      `/app/installations/${installationId}/access_tokens`,
      jwt,
      'POST',
      { repositories: ['platform'], permissions },
      fetchImpl
    );
    if (!response.ok) throw new Error('Mint failed');
    const payload = await response.json();
    if (
      typeof payload.token !== 'string' ||
      !payload.token.startsWith('ghs_')
    ) {
      throw new Error('Invalid token response');
    }
    token = payload.token;
    const childEnv = {
      ...env,
      GH_TOKEN: token,
      GITHUB_TOKEN: token,
      GH_HOST: 'github.com',
      GIT_TERMINAL_PROMPT: '0',
    };
    for (const name of Object.keys(childEnv)) {
      if (name.startsWith('TUTURUUU_BOT_') || name.startsWith('GIT_CONFIG_'))
        delete childEnv[name];
    }
    // Override cached personal credentials without writing repository/global config.
    const args =
      command[0] === 'git'
        ? [
            '-c',
            'credential.helper=',
            '-c',
            'credential.helper=!gh auth git-credential',
            ...command.slice(1),
          ]
        : command.slice(1);
    const result = spawn(command[0], args, {
      env: childEnv,
      shell: false,
      stdio: 'inherit',
      timeout: 3000000,
    });
    code = result.status ?? 1;
  } catch {
    // External errors may include PEM, JWT or response bodies. Never render them.
    stderr.write(
      'Bot command failed. Check Keychain access, IDs, installation and permissions.\n'
    );
  } finally {
    if (token) {
      let revoked = false;
      try {
        const response = await request(
          '/installation/token',
          token,
          'DELETE',
          undefined,
          fetchImpl
        );
        revoked = response.ok;
      } catch {
        revoked = false;
      }
      if (!revoked) {
        stderr.write(
          'Token revocation failed; suspend the installation if needed. Token expires within one hour.\n'
        );
        code = 1;
      }
    }
  }
  return code;
}

module.exports = { parseArgs, loadPrivateKey, createAppJwt, runCli };
if (require.main === module)
  runCli().then((code) => {
    process.exitCode = code;
  });
