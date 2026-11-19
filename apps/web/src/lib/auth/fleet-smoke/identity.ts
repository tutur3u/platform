import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

export const fleetSmokeRequestIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export const fleetSmokePasswordPattern = /^[a-zA-Z0-9_-]{43,64}$/u;
export const fleetSmokeFactorName = 'Fleet smoke';

export function fleetSmokeEmail(requestId: string) {
  return `qa-automation+${requestId}@smoke.tuturuuu.com`;
}

export function fleetSmokeTotp(seed: string, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  if (!/^[A-Z2-7]{16,128}$/u.test(seed)) {
    throw new Error('Invalid fleet smoke TOTP seed');
  }
  const key = [];
  let bits = 0;
  let value = 0;
  for (const character of seed) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push((value >> bits) & 255);
    }
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', Buffer.from(key)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, '0');
}
