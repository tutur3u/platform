import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { managerSchema } from '@/lib/people-registry/schemas';

export const PUT = withPeopleRegistry(async (context) => {
  const body = await readJson(context.request, managerSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc('people_registry_set_manager', {
    p_user: body.userId,
    p_expires_at: body.expiresAt,
    p_remove: body.remove,
  });
  return result.ok ? peopleJson(result.data) : result.response;
});
