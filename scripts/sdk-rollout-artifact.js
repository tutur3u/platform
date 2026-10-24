const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  crypto.createHash(algorithm).update(bytes).digest(encoding);
function parseArgs(args) {
  const result = { hosts: [], waitDrain: 0 };
  const keys = {
    '--channel': 'channel',
    '--tarball': 'tarball',
    '--sha256': 'sha256',
    '--wait-drain': 'waitDrain',
  };
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    const value = args[++i];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${option}`);
    if (option === '--host') {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(value))
        throw new Error('Use an SSH config alias for --host');
      result.hosts.push(value);
    } else if (keys[option]) {
      if (result[keys[option]] && option !== '--wait-drain')
        throw new Error(`Duplicate ${option}`);
      result[keys[option]] = value;
    } else throw new Error(`Unknown option ${option}`);
  }
  if (Boolean(result.channel) === Boolean(result.tarball))
    throw new Error(
      'Choose --channel dev|latest or --tarball PATH_OR_HTTPS_URL --sha256 HASH'
    );
  if (result.channel && !['dev', 'latest'].includes(result.channel))
    throw new Error('Channel must be dev or latest');
  if (result.tarball && !/^[a-f0-9]{64}$/i.test(result.sha256 || ''))
    throw new Error('--tarball requires a SHA-256 checksum');
  if (result.channel && result.sha256)
    throw new Error('--sha256 applies only to --tarball');
  result.waitDrain = Number(result.waitDrain);
  if (
    !Number.isInteger(result.waitDrain) ||
    result.waitDrain < 0 ||
    result.waitDrain > 3600
  )
    throw new Error('--wait-drain must be seconds from 0 to 3600');
  if (new Set(result.hosts).size !== result.hosts.length)
    throw new Error('Duplicate host');
  return result;
}
function alive(pid, group = false) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(group ? -pid : pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
function groupAlive(pid) {
  if (!alive(pid, true)) return false;
  try {
    return cp
      .execFileSync('ps', ['-axo', 'pgid=,stat='], {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 16 * 1024 * 1024,
      })
      .split('\n')
      .some((line) => {
        const [group, state] = line.trim().split(/\s+/);
        return Number(group) === pid && state && !state.startsWith('Z');
      });
  } catch {
    return true;
  }
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const launcher = `const fs=require('node:fs'),cp=require('node:child_process');const gate=fs.createReadStream(null,{fd:3});let started=false;gate.once('data',()=>{started=true;gate.destroy();const child=cp.spawn(${JSON.stringify(command)},${JSON.stringify(args)},{stdio:'inherit',shell:false,env:process.env});child.once('error',()=>process.exit(126));child.once('exit',(code)=>process.exit(code??125));});gate.once('end',()=>{if(!started)process.exit(125)});`;
    const child = cp.spawn(process.execPath, ['-e', launcher], {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      shell: false,
      detached: true,
    });
    let launchError;
    const chunks = [];
    let size = 0;
    let timedOut = false;
    let killTimer;
    const signalOwnGroup = (signal) => {
      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch {}
      }
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      signalOwnGroup('SIGTERM');
      killTimer = setTimeout(() => signalOwnGroup('SIGKILL'), 2000);
    }, options.timeoutMs || 300_000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size <= 8 * 1024 * 1024) chunks.push(chunk);
    });
    // Do not relay installer/config output: failures may include private values.
    child.stderr.resume();
    child.once('error', (error) => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      void (async () => {
        const drainDeadline = Date.now() + 30_000;
        while (groupAlive(child.pid) && Date.now() < drainDeadline)
          await sleep(50);
        clearTimeout(deadline);
        clearTimeout(killTimer);
        if (groupAlive(child.pid)) {
          const error = new Error(
            'Owned subprocess group has not drained; maintenance remains closed for recovery'
          );
          error.unsettled = true;
          reject(error);
        } else if (launchError) reject(launchError);
        else if (code === 0 && !timedOut && size <= 8 * 1024 * 1024)
          resolve(Buffer.concat(chunks).toString());
        else
          reject(
            new Error(
              `${path.basename(command)} failed (${timedOut ? 'timeout' : signal || code}); inspect the private backup/report`
            )
          );
      })().catch(reject);
    });
    child.stdio[3].on('error', () => {});
    child.once('spawn', () => {
      try {
        options.onSpawn?.(child.pid);
        child.stdio[3].end('launch');
      } catch (error) {
        launchError = error;
        child.stdio[3].end();
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(options.input);
  });
}

async function download(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password)
    throw new Error('Downloads require HTTPS without embedded credentials');
  const response = await fetch(target, {
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 100 * 1024 * 1024) throw new Error('Download exceeds 100 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function verifyBytes(bytes, expected) {
  if (expected.sha256 && hash(bytes) !== expected.sha256.toLowerCase())
    throw new Error('SHA-256 mismatch; no installation attempted');
  if (
    expected.integrity &&
    expected.integrity !== `sha512-${hash(bytes, 'sha512', 'base64')}`
  )
    throw new Error('npm integrity mismatch; no installation attempted');
  if (expected.shasum && hash(bytes, 'sha1') !== expected.shasum)
    throw new Error('npm shasum mismatch; no installation attempted');
  return hash(bytes);
}
async function candidate(options, directory) {
  let bytes;
  let metadata;
  if (options.channel) {
    metadata = JSON.parse(
      (
        await download(`https://registry.npmjs.org/tuturuuu/${options.channel}`)
      ).toString()
    );
    if (
      metadata.name !== 'tuturuuu' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:-dev\.[0-9]+\.[a-f0-9]{7})?$/.test(
        metadata.version || ''
      ) ||
      !/^sha512-[A-Za-z0-9+/]+=*$/.test(metadata.dist?.integrity || '') ||
      !/^[a-f0-9]{40}$/.test(metadata.dist?.shasum || '')
    )
      throw new Error('Invalid npm package metadata');
    if ((options.channel === 'dev') !== metadata.version.includes('-dev.'))
      throw new Error('npm dist-tag does not match the requested channel');
    const url = new URL(metadata.dist.tarball);
    if (
      url.origin !== 'https://registry.npmjs.org' ||
      !url.pathname.startsWith('/tuturuuu/-/')
    )
      throw new Error('Unexpected npm tarball source');
    bytes = await download(url.href);
    verifyBytes(bytes, metadata.dist);
  } else {
    bytes = /^https:/.test(options.tarball)
      ? await download(options.tarball)
      : fs.readFileSync(options.tarball);
    verifyBytes(bytes, options);
  }
  const tarball = path.join(directory, 'candidate.tgz');
  fs.writeFileSync(tarball, bytes, { flag: 'wx', mode: 0o600 });
  const manifest = JSON.parse(
    await run('tar', ['-xOf', tarball, 'package/package.json'])
  );
  if (
    manifest.name !== 'tuturuuu' ||
    typeof manifest.bin?.ttr !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-dev\.\d+\.[a-f0-9]{7})?$/.test(manifest.version || '')
  )
    throw new Error('Not a supported tuturuuu package');
  if (
    manifest.version.includes('-dev.') &&
    (manifest.tuturuuuBuild?.channel !== 'dev' ||
      !/^[a-f0-9]{40}$/.test(manifest.tuturuuuBuild?.sourceSha || '') ||
      !manifest.tuturuuuBuild.sourceSha.startsWith(
        manifest.version.split('.').at(-1)
      ))
  )
    throw new Error(
      'Dev tarball requires matching channel and source SHA metadata'
    );
  if (manifest.tuturuuuBuild?.rolloutProtocol !== 1)
    throw new Error(
      'This package predates safe automatic rollout. Use the documented manual drain procedure or wait for a maintenance-capable stable release.'
    );
  if (metadata && metadata.version !== manifest.version)
    throw new Error('Tarball version differs from npm metadata');
  return {
    tarball,
    version: manifest.version,
    sourceSha: manifest.tuturuuuBuild?.sourceSha || metadata?.gitHead || null,
    sha256: hash(bytes),
    channel:
      options.channel ||
      (manifest.version.includes('-dev.') ? 'dev' : 'latest'),
    waitDrain: options.waitDrain,
  };
}
function atomicJson(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, file);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
module.exports = {
  parseArgs,
  run,
  candidate,
  verifyBytes,
  quote,
  hash,
  atomicJson,
  readJson,
  alive,
  groupAlive,
};
