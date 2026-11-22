#!/usr/bin/env node
// Mastermind secret entry on a fleet Mac (macOS 14 or later).
//   secret-request.mjs pair                      pair the owner's phone (prints a one-time code)
//   secret-request.mjs request --operation <id> [--ttl 10m] [-- args...]
//                                               ask the owner for the operation's secret and
//                                               hand it to the operation's command
//   secret-request.mjs owners                    list paired owner keys
//   secret-request.mjs revoke <ownerKeyId>       remove a paired owner key (lost phone)
//   secret-request.mjs fingerprint               print this machine's key fingerprint
//   secret-request.mjs sweep                     remove expired open requests and old spool files
// Exit codes for `request`: 0 command succeeded, 1 command failed, 3 declined,
// 4 expired, 5 cancelled, 6 not delivered, 64 refused before asking.
// The value never reaches this process's output or the agent.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import { fileURLToPath } from 'node:url';
import { EXIT, runPair, runRequest } from './secret-flow.mjs';
import {
  machineKey,
  ownerKeys,
  removeExpiredOpen,
  revokeOwnerKey,
  secretPaths,
  withOwnerKeysLock,
} from './secret-machine.mjs';
import { signerFingerprint } from './secret-protocol.mjs';
import { purgeSecretSpools } from './secret-spool.mjs';

export function parseTtl(text) {
  const match = /^(\d{1,3})(s|m)$/.exec(text ?? '');
  if (!match) return undefined;
  return Number(match[1]) * (match[2] === 'm' ? 60_000 : 1000);
}

export function parseArgs(argv) {
  const dash = argv.indexOf('--');
  const head = dash < 0 ? argv : argv.slice(0, dash);
  const extra = dash < 0 ? [] : argv.slice(dash + 1);
  const options = { _: [] };
  for (let i = 0; i < head.length; i++) {
    if (head[i].startsWith('--')) options[head[i].slice(2)] = head[++i];
    else options._.push(head[i]);
  }
  return { command: options._[0], target: options._[1], options, extra };
}

async function main() {
  const { command, target, options, extra } = parseArgs(process.argv.slice(2));
  const paths = secretPaths();
  const controller = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(name, () => controller.abort());
  const out = (line) => process.stdout.write(`${line}\n`);
  try {
    switch (command) {
      case 'pair':
        return await runPair({ paths, signal: controller.signal });
      case 'request':
        return await runRequest({
          paths,
          operationId: options.operation,
          extra,
          ttlMs: parseTtl(options.ttl),
          signal: controller.signal,
        });
      case 'owners':
        for (const key of ownerKeys(paths)) out(`${key.id}\t${key.pairedAt}`);
        return EXIT.ok;
      case 'revoke':
        out(
          withOwnerKeysLock(paths, () => revokeOwnerKey(paths, target ?? ''))
            ? `Revoked ${target}.`
            : `No owner key ${target ?? ''}.`
        );
        return EXIT.ok;
      case 'fingerprint':
        out(signerFingerprint(machineKey(paths).publicKey));
        return EXIT.ok;
      case 'sweep':
        out(
          `removed ${removeExpiredOpen(paths)} open, ${purgeSecretSpools(paths.answersDir)} spool`
        );
        return EXIT.ok;
      default:
        process.stderr.write(
          'usage: secret-request.mjs pair|request|owners|revoke|fingerprint|sweep\n'
        );
        return EXIT.refused;
    }
  } catch (error) {
    const code = /^secret_[a-z_]+$/.test(error?.message ?? '')
      ? error.message
      : 'secret_failed';
    process.stderr.write(`secret-request: ${code}\n`);
    return EXIT.refused;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().then((code) => process.exit(code));
