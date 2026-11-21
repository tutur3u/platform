import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { flagsSchema } from '@/lib/people-registry/schemas';

export const PUT = withPeopleRegistry(async (context) => {
  const body = await readJson(context.request, flagsSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc('people_registry_set_flags', {
    p_capture_enabled: body.captureEnabled ?? null,
    p_personal_sessions_enabled: body.personalSessionsEnabled ?? null,
    p_stopped: body.stopped ?? null,
  });
  return result.ok ? peopleJson(result.data) : result.response;
});
