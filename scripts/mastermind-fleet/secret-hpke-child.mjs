// The `mm-secret-hpke serve` child of a secret request: it makes the
// request's one-use X25519 key in its own memory, prints only the public
// key, opens exactly one sealed answer and exits. Killing it destroys the
// key. Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { b64url, fromB64url } from './secret-protocol.mjs';

const START_TIMEOUT_MS = 5000;
const OPEN_TIMEOUT_MS = 10_000;

export function startHpke(helperPath, { spawn = nodeSpawn } = {}) {
  const child = spawn(helperPath, ['serve'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin' },
  });
  const lines = createInterface({ input: child.stdout });
  const queue = [];
  const waiters = [];
  let ended = false;
  lines.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else queue.push(line);
  });
  const end = () => {
    ended = true;
    for (const waiter of waiters.splice(0))
      waiter.reject(new Error('secret_hpke_exited'));
  };
  child.on('exit', end);
  child.on('error', end);
  child.stdin.on('error', () => {});

  function nextLine(timeoutMs) {
    if (queue.length) return Promise.resolve(queue.shift());
    if (ended) return Promise.reject(new Error('secret_hpke_exited'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((w) => w.resolve === done);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error('secret_hpke_timeout'));
      }, timeoutMs);
      const done = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
      waiters.push({
        resolve: done,
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  function parse(line) {
    try {
      return JSON.parse(line);
    } catch {
      return {};
    }
  }

  const publicKey = nextLine(START_TIMEOUT_MS).then((line) => {
    const key = fromB64url(parse(line).publicKey, 32);
    if (!key) throw new Error('secret_hpke_start');
    return key;
  });

  return {
    publicKey,
    /** Opens once; the child exits afterwards whatever the result. */
    async open(enc, ct, aad) {
      child.stdin.write(
        `${JSON.stringify({ enc: b64url(enc), ct: b64url(ct), aad: b64url(aad) })}\n`
      );
      const reply = parse(await nextLine(OPEN_TIMEOUT_MS));
      const plaintext =
        typeof reply.plaintext === 'string'
          ? Buffer.from(reply.plaintext, 'base64url')
          : null;
      reply.plaintext = undefined;
      if (!plaintext) throw new Error('secret_open_failed');
      return plaintext;
    },
    kill() {
      if (!ended) child.kill('SIGKILL');
    },
  };
}
