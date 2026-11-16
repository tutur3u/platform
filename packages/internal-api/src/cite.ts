import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface CitationLookupFields {
  type: 'book' | 'article-journal' | 'webpage';
  title: string;
  authors: { family: string; given?: string }[];
  year?: number;
  publisher?: string;
  publisherPlace?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  DOI?: string;
  URL?: string;
  ISBN?: string;
  accessed?: string;
}

export interface CitationLookupResult {
  fields: CitationLookupFields;
  source: 'crossref' | 'openlibrary' | 'webpage' | 'manual';
  needsReview: true;
}

export function lookupCitationSource(
  input: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CitationLookupResult>(
    '/api/v1/cite/lookup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      cache: 'no-store',
    }
  );
}

export type CitationCaptureReceipt = { operations: number; elapsedMs: number };

// Work payloads cross the transport boundary as unknown and are parsed by the
// caller's canonical CiteWork schema, without a private-package SDK dependency.
export type CitationCaptureResult =
  | {
      kind: 'captured';
      work: unknown;
      fields: CitationLookupFields;
      source: 'crossref' | 'openalex' | 'openlibrary' | 'webpage' | 'arxiv';
      needsReview: true;
      cache: 'hit' | 'miss' | 'bypassed';
      receipt: CitationCaptureReceipt;
    }
  | {
      kind: 'candidates';
      candidates: unknown[];
      source: 'openalex';
      needsReview: true;
      receipt: CitationCaptureReceipt;
    }
  | {
      kind: 'manual';
      fields: CitationLookupFields;
      source: 'manual';
      needsReview: true;
      receipt: CitationCaptureReceipt;
    };

export function captureCitationSource(
  input: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CitationCaptureResult>(
    '/api/v1/cite/capture',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      cache: 'no-store',
    }
  );
}

export type CitationLibraryItem = {
  id: string;
  wsId: string;
  ownerUserId: string | null;
  work: unknown;
  fingerprint: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

function citationLibraryPath(wsId: string, itemId?: string) {
  const base = `/api/v1/workspaces/${encodeURIComponent(wsId)}/cite/library`;
  return itemId ? `${base}/${encodeURIComponent(itemId)}` : base;
}

export function getCitationLibraryItems(
  wsId: string,
  ids: string[],
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    items: CitationLibraryItem[];
    missingIds: string[];
  }>(`${citationLibraryPath(wsId)}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
    cache: 'no-store',
  });
}

export function listCitationLibrary(
  wsId: string,
  query: { limit?: number; offset?: number; search?: string } = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ items: CitationLibraryItem[] }>(
    citationLibraryPath(wsId),
    { query, cache: 'no-store' }
  );
}

export function createCitationLibraryItem(
  wsId: string,
  input: { id: string; work: unknown; tags?: string[] },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    item: CitationLibraryItem;
    created: boolean;
  }>(citationLibraryPath(wsId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
}

export function getCitationLibraryItem(
  wsId: string,
  itemId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ item: CitationLibraryItem }>(
    citationLibraryPath(wsId, itemId),
    { cache: 'no-store' }
  );
}

export function updateCitationLibraryItem(
  wsId: string,
  itemId: string,
  input: { expectedVersion: number; work: unknown; tags?: string[] },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ item: CitationLibraryItem }>(
    citationLibraryPath(wsId, itemId),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    }
  );
}

export function deleteCitationLibraryItem(
  wsId: string,
  itemId: string,
  expectedVersion: number,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    citationLibraryPath(wsId, itemId),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion }),
      cache: 'no-store',
    }
  );
}

export type CitationRepairRequest = {
  operationId: string;
  input: string;
  existingWork?: unknown;
};

/** Retain operationId and input across a lost response; never mint one on retry. */
export function repairCitation(
  input: CitationRepairRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>(
    '/api/v1/cite/ai/fix-ref',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    }
  );
}

export { createCitationOperationId } from './cite-operation-id';

/** Canonical works and occurrences are validated by the owning formatter. */
export function formatCitationDocument(
  input: { style: 'apa' | 'harvard'; works: unknown[]; citations: unknown[] },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>('/api/v1/cite/format', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
}

export function validateCitationWork(
  input: { style: 'apa' | 'harvard'; work: unknown },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<unknown>('/api/v1/cite/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
}
