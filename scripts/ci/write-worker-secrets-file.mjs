#!/usr/bin/env node
// Writes the named environment values to a 0600 JSON secrets file so a Worker
// publish can upload code and secrets as ONE version (`deploy --secrets-file`).
// A separate secret write before the code upload creates a secret-only version
// of the previous code, which stays live if the code upload then fails.
//
// Usage:
//   node scripts/ci/write-worker-secrets-file.mjs <out.json> NAME... \
//     [--optional NAME...] [--public-https NAME]
//
// Every required NAME must be a non-empty environment value. Optional names are
// written only when set. --public-https NAME requires that value to be an https
// URL whose host is not loopback, private or a local alias. Errors name the
// variable only; values are never printed.
import { closeSync, openSync, writeSync } from 'node:fs';

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/u;

export function parseArgs(argv) {
  const [out, ...rest] = argv;
  if (!out || out.startsWith('--'))
    throw new Error('Usage: write-worker-secrets-file.mjs <out.json> NAME...');
  const required = [];
  const optional = [];
  const publicHttps = [];
  let mode = 'required';
  for (const arg of rest) {
    if (arg === '--optional') mode = 'optional';
    else if (arg === '--public-https') mode = 'public-https';
    else if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(arg))
      throw new Error(`Invalid secret name argument: ${arg.slice(0, 64)}`);
    else if (mode === 'optional') optional.push(arg);
    else if (mode === 'public-https') {
      publicHttps.push(arg);
      mode = 'required';
    } else required.push(arg);
  }
  if (required.length === 0)
    throw new Error('At least one required secret name is needed');
  for (const name of publicHttps)
    if (!required.includes(name))
      throw new Error(`--public-https ${name} must also be a required name`);
  return { out, required, optional, publicHttps };
}

export function assertPublicHttps(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an https URL`);
  }
  if (
    url.protocol !== 'https:' ||
    PRIVATE_HOST.test(url.hostname) ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === 'host.docker.internal'
  )
    throw new Error(`${name} must be a public https endpoint`);
}

export function collectSecrets({ required, optional, publicHttps }, env) {
  const secrets = {};
  for (const name of required) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '')
      throw new Error(`Missing required Worker secret: ${name}`);
    secrets[name] = value;
  }
  for (const name of optional) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') secrets[name] = value;
  }
  for (const name of publicHttps) assertPublicHttps(name, secrets[name]);
  return secrets;
}

export function writeSecretsFile(out, secrets) {
  // O_EXCL: never reuse or follow an existing path; 0600 from creation.
  const fd = openSync(out, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify(secrets));
  } finally {
    closeSync(fd);
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const parsed = parseArgs(argv);
  const secrets = collectSecrets(parsed, env);
  writeSecretsFile(parsed.out, secrets);
  console.log(
    `Wrote ${Object.keys(secrets).length} Worker secret names to the publish secrets file`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Secrets file failed'
    );
    process.exitCode = 1;
  }
}
