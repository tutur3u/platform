import { z } from 'zod';
import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import { bindingSchema } from '@/lib/people-registry/schemas';

// Internal Fleet desk accounts never serve a tenant registry, so a tenant
// signer cannot spend their provider events. A malformed desk list refuses
// every bind.
const fleetDesks = z.record(
  z.string(),
  z.object({ channel: z.string(), account: z.string() })
);

function isFleetDeskAccount(channel: string, account: string) {
  try {
    const configured = process.env.FLEET_DESKS;
    // Without the desk list, internal accounts cannot be told apart, so binds
    // are refused outside development and tests.
    if (configured === undefined && process.env.NODE_ENV === 'production')
      return true;
    const desks = fleetDesks.safeParse(JSON.parse(configured ?? '{}'));
    if (!desks.success || Array.isArray(desks.data)) return true;
    return Object.values(desks.data).some(
      (desk) => desk.channel === channel && desk.account === account
    );
  } catch {
    return true;
  }
}

export const PUT = withPeopleRegistry(async (context) => {
  const body = await readJson(context.request, bindingSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  if (!body.remove && isFleetDeskAccount(body.channel, body.account)) {
    return peopleJson({ error: 'reserved_account' }, 409);
  }
  const result = await context.rpc<{ reason: string }>(
    'people_registry_set_binding',
    {
      p_channel: body.channel,
      p_account: body.account,
      p_remove: body.remove,
    }
  );
  if (!result.ok) return result.response;
  return peopleJson(
    result.data,
    result.data.reason === 'bound_elsewhere' ? 409 : 200
  );
});
