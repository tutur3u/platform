import { loadControl } from '@/lib/people-registry/control';
import { newWorkspaceKeys } from '@/lib/people-registry/keys';
import { peopleJson, withPeopleRegistry } from '@/lib/people-registry/route';

export const GET = withPeopleRegistry(async (context) => {
  const loaded = await loadControl(context);
  if (!loaded.ok) return loaded.response;
  return peopleJson(loaded.control);
});

// Enables the registry once per workspace with fresh wrapped key material.
// The caller must have signed in within the last five minutes.
export const POST = withPeopleRegistry(async (context) => {
  if (!(await context.hasFreshSignIn())) {
    return peopleJson({ error: 'step_up_required' }, 401);
  }
  const result = await context.rpc<{ reason: string }>(
    'people_registry_enable',
    {
      p_wrapped_keys: newWorkspaceKeys(context.wsId),
    }
  );
  if (!result.ok) return result.response;
  return peopleJson(result.data, result.data.reason === 'enabled' ? 201 : 200);
});
