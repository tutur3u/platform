import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { CitationLibraryError, type CitationLibraryStore } from './contracts';

/** The typed database adapter is enabled only after approved schema application/typegen. */
export function getCitationLibraryStore(
  _client: TypedSupabaseClient
): CitationLibraryStore {
  const unavailable = async (): Promise<never> => {
    throw new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
  };
  return {
    list: unavailable,
    get: unavailable,
    getMany: unavailable,
    findFingerprint: unavailable,
    insert: unavailable,
    update: unavailable,
    remove: unavailable,
  };
}
