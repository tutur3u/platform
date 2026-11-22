import type { ExcalidrawElement } from '../types';

/** Minimal element shape; the sync layer only reads id, version, nonce and deletion. */
export function makeElement(
  id: string,
  overrides: Partial<{
    version: number;
    versionNonce: number;
    isDeleted: boolean;
    x: number;
  }> = {}
): ExcalidrawElement {
  return {
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    ...overrides,
  } as unknown as ExcalidrawElement;
}
