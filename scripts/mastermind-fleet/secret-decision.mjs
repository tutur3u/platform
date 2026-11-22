// Publisher-side shape check of Mastermind secret entry decisions (request
// and pair mode) and their signed outcomes. Mirrors the Web contract
// (apps/web/src/lib/mastermind/fleet/secret.ts) closely enough that a bad
// file is dropped here rather than failing the snapshot. Signed fields are
// never rewritten: text that is not already a fixed point of the scrubber is
// refused instead. An expired request is dropped.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import { fleetText } from './scrub.mjs';
import {
  COMMAND_MAX,
  fromB64url,
  SECRET_OUTCOMES,
} from './secret-protocol.mjs';

const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUESTER = /^(lane-[0-9a-f]{16}|terminal)$/;
const AUDIENCE = /^[0-9a-f]{32}(,[0-9a-f]{32}){0,3}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_TTL_MS = 30 * 60 * 1000;
const SKEW_MS = 60 * 1000;

const b64 = (value, length) =>
  typeof value === 'string' && fromB64url(value, length) !== null;
const fixedPoint = (value, max) =>
  typeof value === 'string' &&
  value.length > 0 &&
  fleetText(value, max) === value;

function argList(value) {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 66 &&
    value.every((arg) => typeof arg === 'string' && !CONTROL.test(arg))
  );
}

/** Whether `command` is the bound JSON text of `{argv}` or `{argv, remote}`. */
export function commandOk(command) {
  if (typeof command !== 'string' || command.length > COMMAND_MAX) return false;
  let parsed;
  try {
    parsed = JSON.parse(command);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return false;
  const keys = Object.keys(parsed).sort().join(',');
  if (keys !== 'argv' && keys !== 'argv,remote') return false;
  return (
    argList(parsed.argv) &&
    (parsed.remote === undefined || argList(parsed.remote))
  );
}

function timesOk(createdAt, expiresAt, now) {
  if (!ISO_MS.test(expiresAt ?? '')) return false;
  const expires = Date.parse(expiresAt);
  const created = Date.parse(createdAt ?? '');
  return (
    expires > now.getTime() &&
    (Number.isNaN(created) || expires - created <= MAX_TTL_MS + SKEW_MS)
  );
}

/** The `secret` payload of a decision file, or null when unusable. */
export function parseSecret(raw, now = new Date()) {
  const s = raw?.secret;
  if (!s || typeof s !== 'object' || s.v !== '1') return null;
  if (!SLUG.test(s.machineId ?? '') || !b64(s.signerKey, 32)) return null;
  if (!timesOk(raw.createdAt, s.expiresAt, now)) return null;
  if (s.mode === 'pair') {
    if (s.pairingId !== raw.id || !/^pair-[0-9a-f]{24}$/.test(raw.id ?? ''))
      return null;
    if (!fixedPoint(s.machineLabel, 40) || !b64(s.machineMac, 32)) return null;
    return {
      mode: 'pair',
      v: '1',
      pairingId: s.pairingId,
      machineId: s.machineId,
      machineLabel: s.machineLabel,
      signerKey: s.signerKey,
      expiresAt: s.expiresAt,
      machineMac: s.machineMac,
    };
  }
  if (s.mode !== 'request') return null;
  if (s.requestId !== raw.id || !/^secret-[0-9a-f]{24}$/.test(raw.id ?? ''))
    return null;
  if (!REQUESTER.test(s.requester ?? '') || !SLUG.test(s.operation ?? ''))
    return null;
  if (!commandOk(s.command) || !['withheld', 'agent'].includes(s.output))
    return null;
  if (!fixedPoint(s.purpose, 120) || !b64(s.publicKey, 32) || !b64(s.sig, 64))
    return null;
  if (!AUDIENCE.test(s.audience ?? '')) return null;
  const ids = s.audience.split(',');
  if (ids.join(',') !== [...ids].sort().join(',')) return null;
  return {
    mode: 'request',
    v: '1',
    requestId: s.requestId,
    machineId: s.machineId,
    requester: s.requester,
    operation: s.operation,
    command: s.command,
    output: s.output,
    purpose: s.purpose,
    expiresAt: s.expiresAt,
    publicKey: s.publicKey,
    signerKey: s.signerKey,
    audience: s.audience,
    sig: s.sig,
  };
}

/** A resolved record's machine-signed outcome, or null. */
export function parseSecretOutcome(raw) {
  if (!raw || !SECRET_OUTCOMES.includes(raw.outcome) || !b64(raw.sig, 64))
    return null;
  if (!/^([0-9a-f]{32}|[0-9a-f]{64})?$/.test(raw.answerDigest ?? ''))
    return null;
  return { outcome: raw.outcome, answerDigest: raw.answerDigest, sig: raw.sig };
}
