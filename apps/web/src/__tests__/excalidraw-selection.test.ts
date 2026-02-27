import { describe, expect, it } from 'vitest';
import {
  getSelectionSignature,
  sanitizeSelectedElementIds,
} from '@/utils/excalidraw-selection';

describe('excalidraw selection helpers', () => {
  describe('sanitizeSelectedElementIds', () => {
    it('returns undefined for empty selections', () => {
      expect(sanitizeSelectedElementIds(undefined)).toBeUndefined();
      expect(sanitizeSelectedElementIds(null)).toBeUndefined();
      expect(sanitizeSelectedElementIds({})).toBeUndefined();
    });

    it('keeps only truthy selected element ids', () => {
      expect(
        sanitizeSelectedElementIds({
          'el-1': true,
          'el-2': false,
          'el-3': undefined,
          'el-4': true,
        })
      ).toEqual({
        'el-1': true,
        'el-4': true,
      });
    });
  });

  describe('getSelectionSignature', () => {
    it('returns stable signature regardless of key order', () => {
      const firstSignature = getSelectionSignature({
        'el-b': true,
        'el-a': true,
      });
      const secondSignature = getSelectionSignature({
        'el-a': true,
        'el-b': true,
      });

      expect(firstSignature).toBe('el-a|el-b');
      expect(secondSignature).toBe(firstSignature);
    });

    it('returns empty signature when no selected ids are present', () => {
      expect(getSelectionSignature(undefined)).toBe('');
      expect(getSelectionSignature({ 'el-1': false })).toBe('');
    });
  });
});
