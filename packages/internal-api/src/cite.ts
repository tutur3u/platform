import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface CitationLookupFields {
  type: 'book' | 'article-journal' | 'webpage';
  title: string;
  authors: { family: string; given?: string }[];
  year?: number;
  publisher?: string;
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
