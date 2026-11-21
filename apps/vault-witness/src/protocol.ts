/**
 * Request shapes. Bodies are canonical CBOR (`decodeCanonical` rejects any
 * other encoding); these checks pin the top-level fields of each operation.
 * Signed entries, records, genesis and keyring heads are validated in depth
 * by `@tuturuuu/vault-crypto` inside the engines.
 */
import type {
  SignedEntry,
  SignedGenesis,
  SignedRecord,
} from '@tuturuuu/vault-crypto';
import type { AppendRequest } from './vault-append';

export class BadRequest extends Error {}

type Obj = Record<string, unknown>;

function obj(value: unknown, keys: readonly string[]): Obj {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  )
    throw new BadRequest('Expected an object');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((k, i) => k !== expected[i])
  )
    throw new BadRequest('Unexpected fields');
  return value as Obj;
}

function bytes(value: unknown, length: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length)
    throw new BadRequest('Bad bytes');
  return value;
}

function nullable<T>(value: unknown, read: (v: unknown) => T): T | null {
  return value === null ? null : read(value);
}

function int(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new BadRequest('Bad integer');
  return value;
}

function str(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256)
    throw new BadRequest('Bad string');
  return value;
}

function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new BadRequest('Bad list');
  return value;
}

export function parseInit(body: unknown) {
  const o = obj(body, ['genesis']);
  return { genesis: o.genesis as SignedGenesis };
}

export function parseAttest(body: unknown) {
  const o = obj(body, ['nonce', 'proofs']);
  return {
    nonce: nullable(o.nonce, (v) => bytes(v, 16)),
    proofs: nullable(o.proofs, (v) => {
      const p = obj(v, ['env', 'variable_ids']);
      return {
        env: str(p.env),
        variable_ids: array(p.variable_ids, 256).map(str),
      };
    }),
  };
}

export function parseAppend(body: unknown): AppendRequest {
  const o = obj(body, ['challenge', 'base', 'entry', 'records']);
  const base = obj(o.base, ['witness_generation', 'seq', 'key_log_head']);
  return {
    challenge: bytes(o.challenge, 16),
    base: {
      witness_generation: int(base.witness_generation, 1),
      seq: int(base.seq),
      key_log_head: bytes(base.key_log_head, 32),
    },
    entry: o.entry === null ? null : (o.entry as SignedEntry),
    records: array(o.records, 256) as SignedRecord[],
  };
}

export function parseTransitions(body: unknown) {
  const o = obj(body, ['after', 'limit']);
  return { after: int(o.after), limit: int(o.limit, 1, 1000) };
}

export function parseAudit(body: unknown) {
  const o = obj(body, ['prev_audit_head', 'audit_head', 'event_count']);
  return {
    prev_audit_head: bytes(o.prev_audit_head, 32),
    audit_head: bytes(o.audit_head, 32),
    event_count: int(o.event_count, 1),
  };
}

export function parseConfirm(body: unknown) {
  return obj(body, ['confirmation']).confirmation;
}

export function parseKeyringPut(body: unknown) {
  return { head: obj(body, ['head']).head };
}

export function parseKeyringAttest(body: unknown) {
  const o = obj(body, ['nonce']);
  return { nonce: nullable(o.nonce, (v) => bytes(v, 16)) };
}

export function parseKeyringConfirm(body: unknown) {
  const o = obj(body, ['signature']);
  return { signature: bytes(o.signature, 64) };
}

const HEX = /^[0-9a-f]+$/;

/** Route identifiers are lowercase hex of exact length. */
export function parseHexId(value: string, length: number): Uint8Array | null {
  if (value.length !== length * 2 || !HEX.test(value)) return null;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++)
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
