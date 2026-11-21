import { concatBytes, sha256 } from '@tuturuuu/vault-crypto';

/**
 * RFC 9162 Merkle tree built bottom-up: at each level adjacent nodes are
 * hashed in pairs and an unpaired last node is promoted unchanged. This gives
 * the same root and inclusion paths as the recursive definition in
 * `@tuturuuu/vault-crypto` (tests compare them), in O(n) for the tree and
 * O(log n) per proof, so one attestation can prove many variables.
 */
const NODE = new Uint8Array([1]);

export type Levels = readonly (readonly Uint8Array[])[];

export function buildLevels(leaves: readonly Uint8Array[]): Levels {
  const levels: Uint8Array[][] = [[...leaves]];
  let level = levels[0] as Uint8Array[];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array;
      const right = level[i + 1];
      next.push(right ? sha256(concatBytes(NODE, left, right)) : left);
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

export function levelsRoot(levels: Levels): Uint8Array {
  const top = levels.at(-1);
  if (!top || top.length === 0) return sha256(new Uint8Array());
  return top[0] as Uint8Array;
}

export function levelsProof(levels: Levels, index: number): Uint8Array[] {
  const size = levels[0]?.length ?? 0;
  if (!Number.isSafeInteger(index) || index < 0 || index >= size)
    throw new RangeError('Leaf index');
  const path: Uint8Array[] = [];
  let i = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l] as readonly Uint8Array[];
    const sibling = i % 2 === 1 ? level[i - 1] : level[i + 1];
    if (sibling) path.push(sibling);
    i = Math.floor(i / 2);
  }
  return path;
}
