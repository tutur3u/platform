import { describe, expect, it } from 'vitest';
import {
  createDocumentDataSchema,
  listDocumentsOptionsSchema,
  listStorageOptionsSchema,
  shareOptionsSchema,
  updateDocumentDataSchema,
  uploadOptionsSchema,
} from './types';

describe('listStorageOptionsSchema', () => {
  it('should validate empty options', () => {
    const result = listStorageOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate path option', () => {
    const result = listStorageOptionsSchema.parse({ path: 'documents' });
    expect(result.path).toBe('documents');
  });

  it('should validate search option', () => {
    const result = listStorageOptionsSchema.parse({ search: 'report' });
    expect(result.search).toBe('report');
  });

  it('should validate limit option', () => {
    const result = listStorageOptionsSchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it('should validate offset option', () => {
    const result = listStorageOptionsSchema.parse({ offset: 10 });
    expect(result.offset).toBe(10);
  });

  it('should validate sortBy option', () => {
    const validSortBy = ['name', 'created_at', 'updated_at', 'size'];
    for (const sortBy of validSortBy) {
      const result = listStorageOptionsSchema.parse({ sortBy });
      expect(result.sortBy).toBe(sortBy);
    }
  });

  it('should validate sortOrder option', () => {
    const result1 = listStorageOptionsSchema.parse({ sortOrder: 'asc' });
    expect(result1.sortOrder).toBe('asc');

    const result2 = listStorageOptionsSchema.parse({ sortOrder: 'desc' });
    expect(result2.sortOrder).toBe('desc');
  });

  it('should validate all options together', () => {
    const result = listStorageOptionsSchema.parse({
      path: 'documents',
      search: 'report',
      limit: 100,
      offset: 50,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    expect(result).toEqual({
      path: 'documents',
      search: 'report',
      limit: 100,
      offset: 50,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  });

  it('should reject limit less than 1', () => {
    const result1 = listStorageOptionsSchema.safeParse({ limit: 0 });
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.issues.length).toBeGreaterThan(0);
    }

    const result2 = listStorageOptionsSchema.safeParse({ limit: -1 });
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject limit greater than 1000', () => {
    const result = listStorageOptionsSchema.safeParse({ limit: 1001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject negative offset', () => {
    const result = listStorageOptionsSchema.safeParse({ offset: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject NaN, null, and undefined for limit', () => {
    const resultNaN = listStorageOptionsSchema.safeParse({ limit: Number.NaN });
    expect(resultNaN.success).toBe(false);
    if (!resultNaN.success) {
      expect(resultNaN.error.issues.length).toBeGreaterThan(0);
    }

    const resultNull = listStorageOptionsSchema.safeParse({ limit: null });
    expect(resultNull.success).toBe(false);
    if (!resultNull.success) {
      expect(resultNull.error.issues.length).toBeGreaterThan(0);
    }

    const resultUndefined = listStorageOptionsSchema.safeParse({
      limit: undefined,
    });
    expect(resultUndefined.success).toBe(false);
    if (!resultUndefined.success) {
      expect(resultUndefined.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject NaN, null, and undefined for offset', () => {
    const resultNaN = listStorageOptionsSchema.safeParse({
      offset: Number.NaN,
    });
    expect(resultNaN.success).toBe(false);
    if (!resultNaN.success) {
      expect(resultNaN.error.issues.length).toBeGreaterThan(0);
    }

    const resultNull = listStorageOptionsSchema.safeParse({ offset: null });
    expect(resultNull.success).toBe(false);
    if (!resultNull.success) {
      expect(resultNull.error.issues.length).toBeGreaterThan(0);
    }

    const resultUndefined = listStorageOptionsSchema.safeParse({
      offset: undefined,
    });
    expect(resultUndefined.success).toBe(false);
    if (!resultUndefined.success) {
      expect(resultUndefined.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject invalid sortBy', () => {
    const result = listStorageOptionsSchema.safeParse({ sortBy: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject invalid sortOrder', () => {
    const result = listStorageOptionsSchema.safeParse({
      sortOrder: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject non-integer limit', () => {
    const result = listStorageOptionsSchema.safeParse({ limit: 10.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject non-integer offset', () => {
    const result = listStorageOptionsSchema.safeParse({ offset: 5.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('uploadOptionsSchema', () => {
  it('should validate empty options', () => {
    const result = uploadOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate path option', () => {
    const result = uploadOptionsSchema.parse({ path: 'documents' });
    expect(result.path).toBe('documents');
  });

  it('should validate upsert true', () => {
    const result = uploadOptionsSchema.parse({ upsert: true });
    expect(result.upsert).toBe(true);
  });

  it('should validate upsert false', () => {
    const result = uploadOptionsSchema.parse({ upsert: false });
    expect(result.upsert).toBe(false);
  });

  it('should validate all options together', () => {
    const result = uploadOptionsSchema.parse({
      path: 'documents',
      upsert: true,
    });
    expect(result).toEqual({
      path: 'documents',
      upsert: true,
    });
  });
});

describe('shareOptionsSchema', () => {
  it('should validate empty options', () => {
    const result = shareOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate minimum expiresIn (60 seconds)', () => {
    const result = shareOptionsSchema.parse({ expiresIn: 60 });
    expect(result.expiresIn).toBe(60);
  });

  it('should validate maximum expiresIn (604800 seconds / 7 days)', () => {
    const result = shareOptionsSchema.parse({ expiresIn: 604800 });
    expect(result.expiresIn).toBe(604800);
  });

  it('should validate common expiresIn values', () => {
    const commonValues = [3600, 7200, 86400]; // 1 hour, 2 hours, 1 day
    for (const value of commonValues) {
      const result = shareOptionsSchema.parse({ expiresIn: value });
      expect(result.expiresIn).toBe(value);
    }
  });

  it('should reject expiresIn less than 60', () => {
    const result1 = shareOptionsSchema.safeParse({ expiresIn: 59 });
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.issues.length).toBeGreaterThan(0);
    }

    const result2 = shareOptionsSchema.safeParse({ expiresIn: 0 });
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject expiresIn greater than 604800', () => {
    const result = shareOptionsSchema.safeParse({ expiresIn: 604801 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject non-integer expiresIn', () => {
    const result = shareOptionsSchema.safeParse({ expiresIn: 60.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject NaN, null, and undefined for expiresIn', () => {
    const resultNaN = shareOptionsSchema.safeParse({
      expiresIn: Number.NaN,
    });
    expect(resultNaN.success).toBe(false);
    if (!resultNaN.success) {
      expect(resultNaN.error.issues.length).toBeGreaterThan(0);
    }

    const resultNull = shareOptionsSchema.safeParse({ expiresIn: null });
    expect(resultNull.success).toBe(false);
    if (!resultNull.success) {
      expect(resultNull.error.issues.length).toBeGreaterThan(0);
    }

    const resultUndefined = shareOptionsSchema.safeParse({
      expiresIn: undefined,
    });
    expect(resultUndefined.success).toBe(false);
    if (!resultUndefined.success) {
      expect(resultUndefined.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('listDocumentsOptionsSchema', () => {
  it('should validate empty options', () => {
    const result = listDocumentsOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate search option', () => {
    const result = listDocumentsOptionsSchema.parse({ search: 'meeting' });
    expect(result.search).toBe('meeting');
  });

  it('should validate limit option', () => {
    const result = listDocumentsOptionsSchema.parse({ limit: 20 });
    expect(result.limit).toBe(20);
  });

  it('should validate offset option', () => {
    const result = listDocumentsOptionsSchema.parse({ offset: 5 });
    expect(result.offset).toBe(5);
  });

  it('should validate isPublic true', () => {
    const result = listDocumentsOptionsSchema.parse({ isPublic: true });
    expect(result.isPublic).toBe(true);
  });

  it('should validate isPublic false', () => {
    const result = listDocumentsOptionsSchema.parse({ isPublic: false });
    expect(result.isPublic).toBe(false);
  });

  it('should validate all options together', () => {
    const result = listDocumentsOptionsSchema.parse({
      search: 'meeting',
      limit: 50,
      offset: 10,
      isPublic: false,
    });
    expect(result).toEqual({
      search: 'meeting',
      limit: 50,
      offset: 10,
      isPublic: false,
    });
  });

  it('should reject limit less than 1', () => {
    const result = listDocumentsOptionsSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject limit greater than 100', () => {
    const result = listDocumentsOptionsSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject negative offset', () => {
    const result = listDocumentsOptionsSchema.safeParse({ offset: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject non-integer limit', () => {
    const result = listDocumentsOptionsSchema.safeParse({ limit: 10.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject non-integer offset', () => {
    const result = listDocumentsOptionsSchema.safeParse({ offset: 5.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject NaN, null, and undefined for limit', () => {
    const resultNaN = listDocumentsOptionsSchema.safeParse({
      limit: Number.NaN,
    });
    expect(resultNaN.success).toBe(false);
    if (!resultNaN.success) {
      expect(resultNaN.error.issues.length).toBeGreaterThan(0);
    }

    const resultNull = listDocumentsOptionsSchema.safeParse({ limit: null });
    expect(resultNull.success).toBe(false);
    if (!resultNull.success) {
      expect(resultNull.error.issues.length).toBeGreaterThan(0);
    }

    const resultUndefined = listDocumentsOptionsSchema.safeParse({
      limit: undefined,
    });
    expect(resultUndefined.success).toBe(false);
    if (!resultUndefined.success) {
      expect(resultUndefined.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject NaN, null, and undefined for offset', () => {
    const resultNaN = listDocumentsOptionsSchema.safeParse({
      offset: Number.NaN,
    });
    expect(resultNaN.success).toBe(false);
    if (!resultNaN.success) {
      expect(resultNaN.error.issues.length).toBeGreaterThan(0);
    }

    const resultNull = listDocumentsOptionsSchema.safeParse({ offset: null });
    expect(resultNull.success).toBe(false);
    if (!resultNull.success) {
      expect(resultNull.error.issues.length).toBeGreaterThan(0);
    }

    const resultUndefined = listDocumentsOptionsSchema.safeParse({
      offset: undefined,
    });
    expect(resultUndefined.success).toBe(false);
    if (!resultUndefined.success) {
      expect(resultUndefined.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('createDocumentDataSchema', () => {
  it('should validate minimal data (name only)', () => {
    const result = createDocumentDataSchema.parse({ name: 'Test Document' });
    expect(result.name).toBe('Test Document');
    expect(result.content).toBeUndefined();
    expect(result.isPublic).toBeUndefined();
  });

  it('should validate with content', () => {
    const result = createDocumentDataSchema.parse({
      name: 'Test Document',
      content: 'Test content',
    });
    expect(result.content).toBe('Test content');
  });

  it('should validate with isPublic true', () => {
    const result = createDocumentDataSchema.parse({
      name: 'Test Document',
      isPublic: true,
    });
    expect(result.isPublic).toBe(true);
  });

  it('should validate with isPublic false', () => {
    const result = createDocumentDataSchema.parse({
      name: 'Test Document',
      isPublic: false,
    });
    expect(result.isPublic).toBe(false);
  });

  it('should validate all fields', () => {
    const result = createDocumentDataSchema.parse({
      name: 'Test Document',
      content: 'Test content',
      isPublic: true,
    });
    expect(result).toEqual({
      name: 'Test Document',
      content: 'Test content',
      isPublic: true,
    });
  });

  it('should reject empty name', () => {
    const result = createDocumentDataSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject name longer than 255 characters', () => {
    const longName = 'a'.repeat(256);
    const result = createDocumentDataSchema.safeParse({ name: longName });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should accept name at maximum length (255 characters)', () => {
    const maxName = 'a'.repeat(255);
    const result = createDocumentDataSchema.parse({ name: maxName });
    expect(result.name).toBe(maxName);
  });

  it('should reject missing name', () => {
    const result = createDocumentDataSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should accept empty content', () => {
    const result = createDocumentDataSchema.parse({
      name: 'Test',
      content: '',
    });
    expect(result.content).toBe('');
  });
});

describe('updateDocumentDataSchema', () => {
  it('should validate empty update (all fields optional)', () => {
    const result = updateDocumentDataSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate name only', () => {
    const result = updateDocumentDataSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('should validate content only', () => {
    const result = updateDocumentDataSchema.parse({
      content: 'Updated content',
    });
    expect(result.content).toBe('Updated content');
  });

  it('should validate isPublic only', () => {
    const result = updateDocumentDataSchema.parse({ isPublic: true });
    expect(result.isPublic).toBe(true);
  });

  it('should validate all fields together', () => {
    const result = updateDocumentDataSchema.parse({
      name: 'Updated Name',
      content: 'Updated content',
      isPublic: false,
    });
    expect(result).toEqual({
      name: 'Updated Name',
      content: 'Updated content',
      isPublic: false,
    });
  });

  it('should reject empty name', () => {
    const result = updateDocumentDataSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject name longer than 255 characters', () => {
    const longName = 'a'.repeat(256);
    const result = updateDocumentDataSchema.safeParse({ name: longName });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should accept name at maximum length (255 characters)', () => {
    const maxName = 'a'.repeat(255);
    const result = updateDocumentDataSchema.parse({ name: maxName });
    expect(result.name).toBe(maxName);
  });

  it('should accept empty content', () => {
    const result = updateDocumentDataSchema.parse({ content: '' });
    expect(result.content).toBe('');
  });

  it('should accept partial updates', () => {
    const result1 = updateDocumentDataSchema.parse({ name: 'Name' });
    expect(result1.content).toBeUndefined();
    expect(result1.isPublic).toBeUndefined();

    const result2 = updateDocumentDataSchema.parse({ content: 'Content' });
    expect(result2.name).toBeUndefined();
    expect(result2.isPublic).toBeUndefined();

    const result3 = updateDocumentDataSchema.parse({ isPublic: true });
    expect(result3.name).toBeUndefined();
    expect(result3.content).toBeUndefined();
  });
});
