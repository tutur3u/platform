import 'server-only';

import {
  PersonalCreditWorkspaceError,
  resolvePersonalCreditWorkspaceId,
} from '@tuturuuu/ai/credits/personal-workspace';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  admitCitationAi,
  deductCitationAi,
  recoverCitationCharge,
  readCitationDurableCharge,
} from './billing';
import { CitationAiError } from './contracts';
import { createCitationAiOperationStore } from './operation-store';
import { generateCitationFix } from './provider';
import {
  createCitationAiService,
  type CitationAiDependencies,
} from './service';
import { boundedCitationOperation } from './timeout';

export function createSessionCitationAiService(
  client: TypedSupabaseClient,
  grounding: Pick<CitationAiDependencies, 'ground' | 'reserveGrounding'>
) {
  return createCitationAiService({
    operations: createCitationAiOperationStore(),
    resolveBillingWorkspace: async (actorId) => {
      try {
        return await boundedCitationOperation(
          resolvePersonalCreditWorkspaceId(client, actorId)
        );
      } catch (error) {
        if (
          error instanceof PersonalCreditWorkspaceError &&
          error.code === 'PERSONAL_WORKSPACE_NOT_FOUND'
        )
          throw new CitationAiError('FEATURE_NOT_ALLOWED', 403);
        throw new CitationAiError('AI_UNAVAILABLE', 503);
      }
    },
    admit: admitCitationAi,
    generate: generateCitationFix,
    ...grounding,
    deduct: deductCitationAi,
    recoverCharge: recoverCitationCharge,
    readDurableCharge: readCitationDurableCharge,
  });
}
