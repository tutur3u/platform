import { concatBytes, equalBytes } from './bytes';
import { sha256 } from './kdf';

/**
 * Merkle tree hashing and inclusion proofs as specified by RFC 9162 §2.1:
 * leaves are hashed with a 0x00 prefix and interior nodes with 0x01, so a
 * leaf can never be confused with a node.
 */
const LEAF = new Uint8Array([0]);
const NODE = new Uint8Array([1]);

export function leafHash(data: Uint8Array): Uint8Array {
  return sha256(concatBytes(LEAF, data));
}

function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concatBytes(NODE, left, right));
}

/** Largest power of two strictly less than n (n > 1). */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** MTH over already-hashed leaves. */
export function treeRoot(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256(new Uint8Array());
  if (leaves.length === 1) return leaves[0] as Uint8Array;
  const k = split(leaves.length);
  return nodeHash(treeRoot(leaves.slice(0, k)), treeRoot(leaves.slice(k)));
}

/** PATH(m, D[n]) from RFC 9162 §2.1.3.1. */
export function inclusionProof(
  leaves: readonly Uint8Array[],
  index: number
): Uint8Array[] {
  if (index < 0 || index >= leaves.length) throw new RangeError('Leaf index');
  if (leaves.length === 1) return [];
  const k = split(leaves.length);
  return index < k
    ? [...inclusionProof(leaves.slice(0, k), index), treeRoot(leaves.slice(k))]
    : [
        ...inclusionProof(leaves.slice(k), index - k),
        treeRoot(leaves.slice(0, k)),
      ];
}

/** Inclusion proof verification from RFC 9162 §2.1.3.2. */
export function verifyInclusion(
  index: number,
  treeSize: number,
  leaf: Uint8Array,
  proof: readonly Uint8Array[],
  root: Uint8Array
): boolean {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(treeSize)) {
    return false;
  }
  if (index < 0 || index >= treeSize) return false;
  let fn = index;
  let sn = treeSize - 1;
  let r = leaf;
  for (const p of proof) {
    if (p.length !== 32 || sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      while (fn % 2 === 0 && fn !== 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equalBytes(r, root);
}
