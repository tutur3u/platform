import {
  peopleJson,
  readJson,
  withPeopleRegistry,
} from '@/lib/people-registry/route';
import {
  createPersonSchema,
  listQuerySchema,
} from '@/lib/people-registry/schemas';

export const GET = withPeopleRegistry(async (context) => {
  const query = listQuerySchema.safeParse(
    Object.fromEntries(context.request.nextUrl.searchParams)
  );
  if (!query.success) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc('people_list_persons', {
    p_query: query.data.q,
    p_limit: query.data.limit,
    p_after: query.data.after ?? null,
  });
  return result.ok ? peopleJson({ persons: result.data }) : result.response;
});

export const POST = withPeopleRegistry(async (context) => {
  const body = await readJson(context.request, createPersonSchema);
  if (!body) return peopleJson({ error: 'invalid_request' }, 400);
  const result = await context.rpc<string>('people_create_person', {
    p_kind: body.kind,
    p_label: body.label,
    p_is_owner: body.isOwner,
  });
  return result.ok ? peopleJson({ id: result.data }, 201) : result.response;
});
