import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { ruleSchema } from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };

// Person-scoped rules. Channel defaults and conversation rules use the same
// definer with their own scope.
export const PUT = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, ruleSchema);
  if (
    !body ||
    body.scope !== 'person' ||
    (!body.remove && body.value === undefined)
  ) {
    return peopleJson({ error: 'invalid_request' }, 400);
  }
  const result = await context.rpc<{ reason: string }>('people_set_rule', {
    p_scope: 'person',
    p_channel: null,
    p_person: params.personId,
    p_conversation: null,
    p_rule: body.rule,
    p_value: body.value ?? null,
    p_expires_at: body.expiresAt ?? null,
    p_base_revision: body.baseRevision,
    p_remove: body.remove,
  });
  if (!result.ok) return result.response;
  return peopleJson(
    result.data,
    result.data.reason === 'revision_conflict' ? 409 : 200
  );
});
