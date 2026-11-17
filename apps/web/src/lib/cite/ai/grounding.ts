import 'server-only';

import { createCitationGroundingSession } from '../capture';
import { reserveCitationGrounding } from './grounding-budget';
import type { CitationAiDependencies } from './service';

/** One cache-free source session per generated proposal, started on the first source read. */
export function createCitationAiGrounding(
  actorId: string
): Pick<CitationAiDependencies, 'ground' | 'reserveGrounding'> {
  let session: ReturnType<typeof createCitationGroundingSession> | undefined;
  return {
    reserveGrounding: () => reserveCitationGrounding(actorId),
    async ground(identifier, signal) {
      signal.throwIfAborted();
      session ??= createCitationGroundingSession({ signal });
      const result = await session.capture(identifier);
      return result.kind === 'captured' ? result.work : null;
    },
  };
}
