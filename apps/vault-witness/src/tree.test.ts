import {
  inclusionProof,
  leafHash,
  treeRoot,
  utf8,
  verifyInclusion,
} from '@tuturuuu/vault-crypto';
import { describe, expect, it } from 'vite-plus/test';
import { buildLevels, levelsProof, levelsRoot } from './tree';

describe('bottom-up RFC 9162 tree', () => {
  it('matches the recursive root and inclusion paths for every size up to 70', () => {
    for (let n = 0; n <= 70; n++) {
      const leaves = Array.from({ length: n }, (_, i) =>
        leafHash(utf8(`leaf-${i}`))
      );
      const levels = buildLevels(leaves);
      const root = levelsRoot(levels);
      expect(root).toEqual(treeRoot(leaves));
      for (let i = 0; i < n; i++) {
        const path = levelsProof(levels, i);
        expect(path).toEqual(inclusionProof(leaves, i));
        expect(verifyInclusion(i, n, leaves[i] as Uint8Array, path, root)).toBe(
          true
        );
      }
    }
  });

  it('rejects out-of-range indices', () => {
    const levels = buildLevels([leafHash(utf8('a'))]);
    expect(() => levelsProof(levels, 1)).toThrow(RangeError);
    expect(() => levelsProof(levels, -1)).toThrow(RangeError);
  });
});
