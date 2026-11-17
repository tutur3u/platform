import 'server-only';

import {
  type CitationBudgetDependencies,
  reserveCitationBudget,
} from '../budget-store';

// One reservation covers a proposal's bounded source session. Allow signed-in
// bursts while capping aggregate registry load separately from anonymous lookups.
const CITE_GROUND_ACTOR_LIMIT = 30;
const CITE_GROUND_GLOBAL_LIMIT = 600;

export async function reserveCitationGrounding(
  actorId: string,
  dependencies: CitationBudgetDependencies = {}
) {
  const result = await reserveCitationBudget(
    {
      scope: 'ground',
      actor: actorId,
      actorLimit: CITE_GROUND_ACTOR_LIMIT,
      globalLimit: CITE_GROUND_GLOBAL_LIMIT,
    },
    dependencies
  );
  return result.kind === 'allowed';
}
