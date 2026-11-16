import 'server-only';

import { createCitationGroundingSession } from '../capture';
import { reserveCitationLookup } from '../lookup-budget';
import type { CitationAiDependencies } from './service';
import { boundedCitationOperation } from './timeout';

/** One lazily started, cache-free source budget per generated proposal. */
export function createCitationAiGrounding(
  headers: Headers
): CitationAiDependencies['ground'] {
  let allowance: Promise<boolean> | undefined;
  let session: ReturnType<typeof createCitationGroundingSession> | undefined;
  return async (identifier, signal) => {
    signal.throwIfAborted();
    allowance ??= boundedCitationOperation(
      reserveCitationLookup(headers),
      5000
    ).then((budget) => budget.kind === 'allowed');
    if (!(await allowance)) return null;
    signal.throwIfAborted();
    session ??= createCitationGroundingSession({ signal });
    const result = await session.capture(identifier);
    return result.kind === 'captured' ? result.work : null;
  };
}
