import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors';
import { TuturuuuClient } from './storage';
import type {
  DeleteDocumentResponse,
  Document,
  DocumentResponse,
  GetDocumentResponse,
  ListDocumentsResponse,
} from './types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DocumentsClient', () => {
  let client: TuturuuuClient;

  beforeEach(() => {
    mockFetch.mockClear();
    client = new TuturuuuClient('ttr_test_key');
  });

  const mockDocument: Document = {
    id: 'doc-123',
    name: 'Test Document',
    content: 'Test content',
    is_public: false,
    created_at: '2024-01-01T00:00:00Z',
  };

  describe('list', () => {
    it('should list documents with default options', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [mockDocument],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.list();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents?'),
        expect.any(Object)
      );
    });

    it('should list documents with search query', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [mockDocument],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.list({ search: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test'),
        expect.any(Object)
      );
    });

    it('should list documents with pagination', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [],
        pagination: { limit: 20, offset: 10, total: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.list({ limit: 20, offset: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=10'),
        expect.any(Object)
      );
    });

    it('should list documents filtered by isPublic', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [mockDocument],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.list({ isPublic: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('isPublic=true'),
        expect.any(Object)
      );
    });

    it('should list documents with all options', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [],
        pagination: { limit: 10, offset: 5, total: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.list({
        search: 'meeting',
        limit: 10,
        offset: 5,
        isPublic: false,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=meeting'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=5'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('isPublic=false'),
        expect.any(Object)
      );
    });

    it('should reject invalid limit', async () => {
      await expect(client.documents.list({ limit: 0 })).rejects.toThrow();
      await expect(client.documents.list({ limit: 101 })).rejects.toThrow();
    });

    it('should reject invalid offset', async () => {
      await expect(client.documents.list({ offset: -1 })).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create document with minimal data', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document created',
        data: mockDocument,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.create({
        name: 'Test Document',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should create document with all fields', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document created',
        data: mockDocument,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.create({
        name: 'Test Document',
        content: 'Test content',
        isPublic: false,
      });

      expect(result).toEqual(mockResponse);
    });

    it('should reject empty name', async () => {
      await expect(client.documents.create({ name: '' })).rejects.toThrow();
    });

    it('should reject name longer than 255 characters', async () => {
      const longName = 'a'.repeat(256);
      await expect(
        client.documents.create({ name: longName })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get document by ID', async () => {
      const mockResponse: GetDocumentResponse = {
        data: mockDocument,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.get('doc-123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-123'),
        expect.any(Object)
      );
    });

    it('should throw ValidationError for empty ID', async () => {
      await expect(client.documents.get('')).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update document name', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document updated',
        data: { ...mockDocument, name: 'Updated Name' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.update('doc-123', {
        name: 'Updated Name',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-123'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('should update document content', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document updated',
        data: { ...mockDocument, content: 'New content' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.update('doc-123', {
        content: 'New content',
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should update document visibility', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document updated',
        data: { ...mockDocument, is_public: true },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.update('doc-123', {
        isPublic: true,
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should update multiple fields', async () => {
      const mockResponse: DocumentResponse = {
        message: 'Document updated',
        data: {
          ...mockDocument,
          name: 'New Name',
          content: 'New content',
          is_public: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.update('doc-123', {
        name: 'New Name',
        content: 'New content',
        isPublic: true,
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw ValidationError for empty ID', async () => {
      await expect(
        client.documents.update('', { name: 'Test' })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject empty name', async () => {
      await expect(
        client.documents.update('doc-123', { name: '' })
      ).rejects.toThrow();
    });

    it('should reject name longer than 255 characters', async () => {
      const longName = 'a'.repeat(256);
      await expect(
        client.documents.update('doc-123', { name: longName })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete document', async () => {
      const mockResponse: DeleteDocumentResponse = {
        message: 'Document deleted',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.delete('doc-123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-123'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should throw ValidationError for empty ID', async () => {
      await expect(client.documents.delete('')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('search', () => {
    it('should search documents', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [mockDocument],
        pagination: { limit: 50, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.search('test query');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test+query'),
        expect.any(Object)
      );
    });

    it('should search documents with additional options', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [mockDocument],
        pagination: { limit: 10, offset: 0, total: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.documents.search('test', {
        limit: 10,
        isPublic: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('isPublic=true'),
        expect.any(Object)
      );
    });

    it('should handle empty search query', async () => {
      const mockResponse: ListDocumentsResponse = {
        data: [],
        pagination: { limit: 50, offset: 0, total: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.documents.search('');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
