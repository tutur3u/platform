import { z } from 'zod';
import { loadControl } from '@/lib/people-registry/control';
import { decryptDisplay, displayBinding } from '@/lib/people-registry/keys';
import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import {
  deletePersonSchema,
  updatePersonSchema,
} from '@/lib/people-registry/schemas';

type Params = { wsId: string; personId: string };
const personId = z.string().uuid();

type IdentityRow = {
  displayCiphertext?: string | null;
  channel?: string;
  providerAccountId?: string;
} & Record<string, unknown>;

export const GET = withPeopleRegistry<Params>(async (context, params) => {
  if (!personId.safeParse(params.personId).success)
    return peopleJson({ error: 'not_found' }, 404);
  const result = await context.rpc<{ identities?: IdentityRow[] } | null>(
    'people_get_person',
    {
      p_person: params.personId,
    }
  );
  if (!result.ok) return result.response;
  if (!result.data) return peopleJson({ error: 'not_found' }, 404);
  const identities = result.data.identities;
  if (!identities?.length) return peopleJson(result.data);
  const loaded = await loadControl(context);
  if (!loaded.ok) return loaded.response;
  return peopleJson({
    ...result.data,
    identities: identities.map(({ displayCiphertext, ...identity }) => ({
      ...identity,
      displayValue: displayCiphertext
        ? decryptDisplay(
            loaded.keys.all,
            context.wsId,
            displayBinding(
              params.personId,
              identity.channel,
              identity.providerAccountId
            ),
            Buffer.from(displayCiphertext, 'base64')
          )
        : null,
    })),
  });
});

export const PATCH = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, updatePersonSchema);
  if (!body || !personId.safeParse(params.personId).success) {
    return peopleJson({ error: 'invalid_request' }, 400);
  }
  const result = await context.rpc<{ reason: string }>('people_update_person', {
    p_person: params.personId,
    p_base_version: body.baseVersion,
    p_label: body.label ?? null,
    p_kind: body.kind ?? null,
  });
  if (!result.ok) return result.response;
  return peopleJson(
    result.data,
    result.data.reason === 'revision_conflict' ? 409 : 200
  );
});

// Deletion is two steps: fence (begin), then remove once memories are purged.
export const DELETE = withPeopleRegistry<Params>(async (context, params) => {
  const body = await readJson(context.request, deletePersonSchema);
  if (!body || !personId.safeParse(params.personId).success) {
    return peopleJson({ error: 'invalid_request' }, 400);
  }
  const result =
    body.step === 'begin'
      ? await context.rpc('people_begin_delete', {
          p_person: params.personId,
          p_without_suppression: body.withoutSuppression,
        })
      : await context.rpc('people_finish_delete', {
          p_person: params.personId,
        });
  return result.ok ? peopleJson(result.data) : result.response;
});
