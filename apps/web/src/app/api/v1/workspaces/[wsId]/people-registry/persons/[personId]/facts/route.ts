import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { factSchema } from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };

export const PUT = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, factSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc<{ reason: string }>('people_set_fact', {
    p_person: params.personId,
    p_key: body.key,
    p_value: body.value ?? null,
    p_base_revision: body.baseRevision,
    p_audience: body.audience ?? null,
    p_audience_conversations: body.audienceConversationIds ?? null,
    p_owner_dm: body.ownerDm ?? null,
    p_remove: body.remove,
  });
  if (!result.ok) return result.response;
  return peopleJson(
    result.data,
    result.data.reason === 'revision_conflict' ? 409 : 200
  );
});
