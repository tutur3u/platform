import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { consentSchema } from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };

export const PUT = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, consentSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc('people_set_consent', {
    p_person: params.personId,
    p_conversation: null,
    p_store: body.store,
    p_state: body.state,
    p_basis: body.basis ?? null,
    p_evidence: body.evidence,
    p_scope: body.scope,
    p_expires_at: body.expiresAt ?? null,
  });
  return result.ok ? peopleJson(result.data) : result.response;
});
