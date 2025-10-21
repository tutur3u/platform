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
    expect(() => listStorageOptionsSchema.parse({ limit: 0 })).toThrow();
    expect(() => listStorageOptionsSchema.parse({ limit: -1 })).toThrow();
  });

  it('should reject limit greater than 1000', () => {
    expect(() => listStorageOptionsSchema.parse({ limit: 1001 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => listStorageOptionsSchema.parse({ offset: -1 })).toThrow();
  });

  it('should reject invalid sortBy', () => {
    expect(() =>
      listStorageOptionsSchema.parse({ sortBy: 'invalid' })
    ).toThrow();
  });

  it('should reject invalid sortOrder', () => {
    expect(() =>
      listStorageOptionsSchema.parse({ sortOrder: 'invalid' })
    ).toThrow();
  });

  it('should reject non-integer limit', () => {
    expect(() => listStorageOptionsSchema.parse({ limit: 10.5 })).toThrow();
  });

  it('should reject non-integer offset', () => {
    expect(() => listStorageOptionsSchema.parse({ offset: 5.5 })).toThrow();
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
    expect(() => shareOptionsSchema.parse({ expiresIn: 59 })).toThrow();
    expect(() => shareOptionsSchema.parse({ expiresIn: 0 })).toThrow();
  });

  it('should reject expiresIn greater than 604800', () => {
    expect(() => shareOptionsSchema.parse({ expiresIn: 604801 })).toThrow();
  });

  it('should reject non-integer expiresIn', () => {
    expect(() => shareOptionsSchema.parse({ expiresIn: 60.5 })).toThrow();
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
    expect(() => listDocumentsOptionsSchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject limit greater than 100', () => {
    expect(() => listDocumentsOptionsSchema.parse({ limit: 101 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => listDocumentsOptionsSchema.parse({ offset: -1 })).toThrow();
  });

  it('should reject non-integer limit', () => {
    expect(() => listDocumentsOptionsSchema.parse({ limit: 10.5 })).toThrow();
  });

  it('should reject non-integer offset', () => {
    expect(() => listDocumentsOptionsSchema.parse({ offset: 5.5 })).toThrow();
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
    expect(() => createDocumentDataSchema.parse({ name: '' })).toThrow();
  });

  it('should reject name longer than 255 characters', () => {
    const longName = 'a'.repeat(256);
    expect(() => createDocumentDataSchema.parse({ name: longName })).toThrow();
  });

  it('should accept name at maximum length (255 characters)', () => {
    const maxName = 'a'.repeat(255);
    const result = createDocumentDataSchema.parse({ name: maxName });
    expect(result.name).toBe(maxName);
  });

  it('should reject missing name', () => {
    expect(() => createDocumentDataSchema.parse({})).toThrow();
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
    expect(() => updateDocumentDataSchema.parse({ name: '' })).toThrow();
  });

  it('should reject name longer than 255 characters', () => {
    const longName = 'a'.repeat(256);
    expect(() => updateDocumentDataSchema.parse({ name: longName })).toThrow();
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
