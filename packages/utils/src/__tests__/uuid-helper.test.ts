import { describe, expect, it } from 'vitest';
import { generateRandomUUID, generateUUID } from '../uuid-helper';

describe('UUID Helper', () => {
  describe('generateUUID', () => {
    it('generates consistent UUID for same inputs', () => {
      const uuid1 = generateUUID('test-id-1');
      const uuid2 = generateUUID('test-id-1');
      expect(uuid1).toBe(uuid2);
    });

    it('generates different UUIDs for different inputs', () => {
      const uuid1 = generateUUID('test-id-1');
      const uuid2 = generateUUID('test-id-2');
      expect(uuid1).not.toBe(uuid2);
    });

    it('generates valid UUID format', () => {
      const uuid = generateUUID('test-id');
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('handles multiple UUIDs concatenated', () => {
      const uuid1 = generateUUID('id1', 'id2');
      const uuid2 = generateUUID('id1', 'id2');
      expect(uuid1).toBe(uuid2);
    });

    it('generates different UUID when order changes', () => {
      const uuid1 = generateUUID('id1', 'id2');
      const uuid2 = generateUUID('id2', 'id1');
      expect(uuid1).not.toBe(uuid2);
    });

    it('handles empty string input', () => {
      const uuid = generateUUID('');
      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
    });

    it('handles single UUID input', () => {
      const uuid = generateUUID('single-id');
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('handles multiple inputs', () => {
      const uuid = generateUUID('a', 'b', 'c', 'd');
      expect(uuid).toBeDefined();
    });
  });

  describe('generateRandomUUID', () => {
    it('generates valid UUIDv4 format', () => {
      const uuid = generateRandomUUID();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('generates different UUIDs on each call', () => {
      const uuid1 = generateRandomUUID();
      const uuid2 = generateRandomUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it('generates unique UUIDs across multiple calls', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateRandomUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });
});
