import {
  fleetGrantInputSchema,
  fleetGrantResultSchema,
} from '@tuturuuu/internal-api/fleet';
import { parseFleetRequest } from '../../intent-request';
import { callFleetOwner } from '../owner-db';
import { withFleetOwner } from '../owner-session';

export const POST = withFleetOwner(
  async (actorId, request) => {
    const parsed = await parseFleetRequest(request, fleetGrantInputSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;
    return callFleetOwner(
      'fleet_owner_grant_access',
      {
        p_actor_id: actorId,
        p_email: input.email,
        p_tier: input.tier,
        p_capabilities: input.capabilities,
        p_project_keys: input.projectKeys,
        p_expires_at: input.expiresAt,
        p_questions_per_hour: input.questionsPerHour,
        p_intents_per_day: input.intentsPerDay,
        p_model_budget_per_month: input.modelBudgetPerMonth,
        p_expected_generation: input.expectedGeneration,
      },
      fleetGrantResultSchema
    );
  },
  { mutation: true }
);
