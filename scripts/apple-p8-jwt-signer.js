#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const DEFAULT_EXPIRES_IN_SECONDS = 15_777_000;

function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');

  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);

  return Buffer.from(`${normalized}${'='.repeat(padding)}`, 'base64');
}

function parseArgs(argv) {
  const parsed = {
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--team-id':
      case '--iss':
        parsed.teamId = next;
        index += 1;
        break;
      case '--client-id':
      case '--sub':
        parsed.clientId = next;
        index += 1;
        break;
      case '--key-id':
      case '--kid':
        parsed.keyId = next;
        index += 1;
        break;
      case '--p8-file':
      case '--private-key-file':
        parsed.p8File = next;
        index += 1;
        break;
      case '--private-key':
      case '--p8':
        parsed.privateKey = next;
        index += 1;
        break;
      case '--expires-in-seconds':
        parsed.expiresInSeconds = next;
        index += 1;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return parsed;
}

function printUsage(stdout = process.stdout) {
  stdout.write(`Usage:
  bun apple:p8-jwt --team-id <team-id> --client-id <services-id> --key-id <key-id> --p8-file <path>

Options:
  --team-id, --iss              Apple Team ID
  --client-id, --sub            Apple Services ID / client_id
  --key-id, --kid               Apple key ID for the .p8 key
  --p8-file, --private-key-file Path to the Apple .p8 private key
  --private-key, --p8           Raw PEM content for the Apple .p8 private key
  --expires-in-seconds          JWT lifetime in seconds (default: ${DEFAULT_EXPIRES_IN_SECONDS})
  --json                        Print a JSON payload with token metadata
  --help, -h                    Show this help text
`);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function parseExpiresInSeconds(value) {
  if (value == null) {
    return DEFAULT_EXPIRES_IN_SECONDS;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('expiresInSeconds must be a positive integer');
  }

  return parsed;
}

function loadPrivateKey({ p8File, privateKey }) {
  if (typeof privateKey === 'string' && privateKey.trim().length > 0) {
    return privateKey.trim();
  }

  if (typeof p8File === 'string' && p8File.trim().length > 0) {
    const resolvedPath = path.resolve(p8File);
    return fs.readFileSync(resolvedPath, 'utf8').trim();
  }

  throw new Error('Either --p8-file or --private-key must be provided');
}

function buildAppleClientSecret({
  teamId,
  clientId,
  keyId,
  privateKey,
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const normalizedTeamId = requireString(teamId, 'teamId');
  const normalizedClientId = requireString(clientId, 'clientId');
  const normalizedKeyId = requireString(keyId, 'keyId');
  const normalizedPrivateKey = requireString(privateKey, 'privateKey');
  const normalizedExpiresInSeconds = parseExpiresInSeconds(expiresInSeconds);

  const header = {
    alg: 'ES256',
    kid: normalizedKeyId,
    typ: 'JWT',
  };

  const payload = {
    iss: normalizedTeamId,
    iat: nowSeconds,
    exp: nowSeconds + normalizedExpiresInSeconds,
    aud: APPLE_AUDIENCE,
    sub: normalizedClientId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: normalizedPrivateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return {
    header,
    payload,
    token: `${signingInput}.${base64UrlEncode(signature)}`,
  };
}

function decodeJwt(token) {
  const [encodedHeader, encodedPayload] = token.split('.');

  return {
    header: JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')),
    payload: JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')),
  };
}

function main(
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
) {
  try {
    const args = parseArgs(argv);

    if (args.help) {
      printUsage(stdout);
      return 0;
    }

    const expiresInSeconds = parseExpiresInSeconds(args.expiresInSeconds);
    const privateKey = loadPrivateKey(args);
    const result = buildAppleClientSecret({
      teamId: args.teamId,
      clientId: args.clientId,
      keyId: args.keyId,
      privateKey,
      expiresInSeconds,
    });

    if (args.json) {
      stdout.write(
        `${JSON.stringify(
          {
            token: result.token,
            expiresAt: new Date(result.payload.exp * 1000).toISOString(),
            expiresInSeconds,
            issuedAt: new Date(result.payload.iat * 1000).toISOString(),
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    stdout.write(`${result.token}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Failed to sign Apple JWT'}\n`
    );
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  APPLE_AUDIENCE,
  DEFAULT_EXPIRES_IN_SECONDS,
  base64UrlDecode,
  base64UrlEncode,
  buildAppleClientSecret,
  decodeJwt,
  loadPrivateKey,
  main,
  parseArgs,
  parseExpiresInSeconds,
  printUsage,
};
