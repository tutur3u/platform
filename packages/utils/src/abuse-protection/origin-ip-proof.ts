import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeClientIp } from './ip-address';

export const ORIGIN_IP_PROOF_TTL_SECONDS = 60;
const MAX_FUTURE_SKEW_SECONDS = 5;
const PREFIX = 'hmac-v1';

function digest(secret: string, timestamp: number, ip: string): string {
  return bytesToHex(
    hmac(
      sha256,
      utf8ToBytes(secret),
      utf8ToBytes(`tuturuuu-origin-client-ip/v1\n${timestamp}\n${ip}`)
    )
  );
}

function equalSignature(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) {
    difference |= (actual.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function createOriginClientIpProof({
  ip,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  ip: string;
  secret: string;
  nowSeconds?: number;
}): string | null {
  const normalized = normalizeClientIp(ip);
  if (
    !normalized ||
    secret.length < 32 ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 1_000_000_000 ||
    nowSeconds > 9_999_999_999
  )
    return null;
  return `${PREFIX};${nowSeconds};${normalized};${digest(secret, nowSeconds, normalized)}`;
}

export function verifyOriginClientIpProof({
  proof,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  proof: string | null;
  secret: string | undefined;
  nowSeconds?: number;
}): string | null {
  if (
    !proof ||
    proof.length > 160 ||
    !secret ||
    secret.length < 32 ||
    !Number.isSafeInteger(nowSeconds)
  )
    return null;
  const match = /^hmac-v1;([0-9]{10});([^;]{2,45});([a-f0-9]{64})$/.exec(proof);
  if (!match) return null;
  const timestamp = Number(match[1]);
  const ip = match[2];
  const signature = match[3];
  if (!ip || !signature || normalizeClientIp(ip) !== ip) return null;
  const age = nowSeconds - timestamp;
  if (age > ORIGIN_IP_PROOF_TTL_SECONDS || age < -MAX_FUTURE_SKEW_SECONDS)
    return null;
  return equalSignature(signature, digest(secret, timestamp, ip)) ? ip : null;
}
