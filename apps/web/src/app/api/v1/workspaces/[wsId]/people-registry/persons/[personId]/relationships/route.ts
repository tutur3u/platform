import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { relationshipSchema } from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };

export const PUT = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, relationshipSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const [from, to] =
    body.direction === 'out'
      ? [params.personId, body.otherPersonId]
      : [body.otherPersonId, params.personId];
  const result = await context.rpc('people_set_relationship', {
    p_from: from,
    p_to: to,
    p_kind: body.kind,
    p_label: body.label ?? null,
    p_confidence: body.confidence,
    p_remove: body.remove,
  });
  return result.ok ? peopleJson(result.data) : result.response;
});
