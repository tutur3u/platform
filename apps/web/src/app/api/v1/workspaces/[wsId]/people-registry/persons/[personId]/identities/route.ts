import { loadControl } from '@/lib/people-registry/control';
import {
  InvalidExternalIdError,
  displayBinding,
  encryptDisplay,
  lookupHash,
  suppressionToken,
} from '@/lib/people-registry/keys';
import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import {
  addIdentitySchema,
  decideIdentitySchema,
} from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };

// PostgREST reads bytea arguments as hex escapes.
const hex = (bytes: Buffer) => `\\x${bytes.toString('hex')}`;

// The raw external ID arrives only in the request body. The server keeps its
// lookup hash, the suppression token for every live suppression key version
// and the encrypted display value.
export const POST = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, addIdentitySchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const loaded = await loadControl(context);
  if (!loaded.ok) return loaded.response;
  const identity = {
    wsId: context.wsId,
    channel: body.channel,
    account: body.account,
    externalId: body.externalId,
  };
  let lookups: { version: number; hash: Buffer }[];
  try {
    lookups = loaded.keys.all
      .filter((key) => key.purpose === 'sender_lookup')
      .map((key) => ({
        version: key.version,
        hash: lookupHash(key, identity),
      }));
  } catch (error) {
    if (error instanceof InvalidExternalIdError) {
      return peopleJson({ error: 'invalid_external_id' }, 400);
    }
    throw error;
  }
  const lookupKey = loaded.keys.current('sender_lookup');
  const lookup = lookups.find(
    (entry) => entry.version === lookupKey.version
  )?.hash;
  if (!lookup) throw new Error('No current sender lookup hash');
  const suppression = loaded.keys.current('suppression');
  const suppressionKeys = loaded.keys.all.filter(
    (key) => key.purpose === 'suppression'
  );
  // Every retained lookup version under every suppression version, so a token
  // stored before a rotation still matches.
  const checks = lookups.flatMap((entry) =>
    suppressionKeys.map((key) =>
      hex(suppressionToken(key, context.wsId, entry.hash))
    )
  );
  const display = body.displayValue
    ? encryptDisplay(
        loaded.keys.current('display'),
        context.wsId,
        displayBinding(params.personId, body.channel, body.account),
        body.displayValue
      )
    : null;
  const result = await context.rpc<{ reason: string }>('people_add_identity', {
    p_person: params.personId,
    p_channel: body.channel,
    p_account: body.account,
    p_lookup_hash: hex(lookup),
    p_key_version: lookupKey.version,
    p_display_ciphertext: display ? hex(display) : null,
    p_basis: body.basis,
    p_suppression_token: hex(
      suppressionToken(suppression, context.wsId, lookup)
    ),
    p_suppression_key_version: suppression.version,
    p_suppression_checks: checks,
  });
  if (!result.ok) return result.response;
  const status =
    { proposed: 201, duplicate: 200, suppressed: 409 }[result.data.reason] ??
    200;
  return peopleJson(result.data, status);
});

export const PATCH = withPeopleRegistry<Params>(async (context) => {
  const body = await readJson(context.request, decideIdentitySchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc<{ reason: string }>(
    'people_decide_identity',
    {
      p_identity: body.identityId,
      p_state: body.state,
    }
  );
  if (!result.ok) return result.response;
  const conflict = ['confirmation_conflict', 'suppressed'].includes(
    result.data.reason
  );
  return peopleJson(result.data, conflict ? 409 : 200);
});
