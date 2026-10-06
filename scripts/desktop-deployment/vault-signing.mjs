import { execFileSync, spawn } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeSigningBundle } from './vault-bundle.mjs';
import { mask } from './vault-fetch.mjs';

const HOST_ENV = new Set([
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramData',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'HOME',
  'TMP',
  'TEMP',
  'TMPDIR',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
  'RUNNER_OS',
  'RUNNER_ARCH',
  'USERNAME',
  'USERDOMAIN',
  'LANG',
  'LC_ALL',
  'SHELL',
  'TERM',
  'CI',
  'FLUTTER_ROOT',
  'PUB_CACHE',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_SHA',
  'GITHUB_WORKSPACE',
  'GITHUB_REPOSITORY',
]);
export function signingEnvironment(host, privateValues, temp) {
  const env = Object.fromEntries(
    Object.entries(host).filter(([name]) => HOST_ENV.has(name))
  );
  const result = {
    ...env,
    ...privateValues,
    DESKTOP_PLATFORM: host.DESKTOP_PLATFORM,
    DESKTOP_SIGNING_TEMP: temp,
  };
  // A wire-valid certificate is not necessarily representable in an OS environment.
  // Keep the entire child environment conservatively below the Windows 32K boundary.
  if (
    Buffer.byteLength(
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}\0`)
        .join('')
    ) > 30000
  )
    throw new Error(
      'Desktop signing environment exceeds portable admission bound'
    );
  return result;
}
export async function privateDirectory(host, execute = execFileSync) {
  const temp = await mkdtemp(join(host.RUNNER_TEMP, 'desktop-vault-'));
  try {
    if (host.DESKTOP_PLATFORM === 'windows') {
      if (
        !/^[A-Za-z0-9_.-]+$/u.test(host.USERDOMAIN ?? '') ||
        !/^[A-Za-z0-9_.-]+$/u.test(host.USERNAME ?? '')
      )
        throw new Error('Invalid runner principal');
      execute(
        'icacls.exe',
        [
          temp,
          '/inheritancelevel:r',
          '/grant:r',
          `${host.USERDOMAIN}\\${host.USERNAME}:(OI)(CI)F`,
        ],
        { stdio: 'ignore' }
      );
    } else await chmod(temp, 0o700);
    return temp;
  } catch {
    await rm(temp, { recursive: true, force: true });
    throw new Error('Desktop private directory admission failed');
  }
}
/** Stop only the owned signer tree; abrupt OS termination still relies on ephemeral runners. */
export function stopSignerTree(child, platform, execute = execFileSync) {
  if (!Number.isSafeInteger(child.pid) || child.pid < 1) return;
  try {
    if (platform === 'windows')
      execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* Already exited; close remains authoritative. */
  }
}
export function packageChild(
  env,
  { launch = spawn, stopTree = stopSignerTree } = {}
) {
  return new Promise((resolve, reject) => {
    const child = launch(
      process.execPath,
      ['scripts/desktop-deployment/package-ci.mjs'],
      {
        env,
        stdio: 'ignore',
        windowsHide: true,
        detached: env.DESKTOP_PLATFORM !== 'windows',
      }
    );
    let cancelled = false;
    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      stopTree(child, env.DESKTOP_PLATFORM);
    };
    const cleanup = () => {
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    child.once('error', () => {
      cleanup();
      reject(new Error('Desktop signing child failed'));
    });
    child.once('close', (code) => {
      cleanup();
      if (code === 0 && !cancelled) resolve();
      else reject(new Error('Desktop signing child failed'));
    });
  });
}
/** Private values are child-only; no GitHub env/output files or signing archives. */
export async function signVaultBundle(
  host,
  bundle,
  { hide = mask, directory = privateDirectory, sign = packageChild } = {}
) {
  let temp;
  let env;
  let values;
  try {
    values = decodeSigningBundle(bundle, host.DESKTOP_PLATFORM);
    for (const value of Object.values(values)) hide(value);
    temp = await directory(host);
    env = signingEnvironment(host, values, temp);
    await sign(env);
  } catch {
    throw new Error('Desktop vault signing failed; no package was published');
  } finally {
    // JS strings cannot be reliably zeroed. Drop owned references; never persist them.
    if (env) for (const name of Object.keys(env)) delete env[name];
    if (values) for (const name of Object.keys(values)) delete values[name];
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
