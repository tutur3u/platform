import { z } from 'zod';
import { machineJson, withPeopleMachine } from '@/lib/people-registry/machine';

// Invalidation metadata for drain principals, read after a workspace-bound
// cursor. See apps/docs/platform/features/people-registry.mdx#caching-and-invalidation.

const querySchema = z.object({
  after: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,17})$/)
    .default('0'),
  limit: z
    .string()
    .regex(/^[1-9][0-9]{0,2}$/)
    .default('100')
    .transform(Number)
    .pipe(z.number().max(500)),
});

export const GET = withPeopleMachine(
  ['drain'],
  async ({ request, principal, rpc }) => {
    const query = querySchema.safeParse({
      after: request.nextUrl.searchParams.get('after') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    });
    if (!query.success) return machineJson({ error: 'invalid_request' }, 400);
    const result = await rpc('people_list_changes', {
      p_ws: principal.wsId,
      p_principal: principal.principalId,
      p_after: query.data.after,
      p_limit: query.data.limit,
    });
    const data = result.data as {
      reason?: string;
      events?: unknown;
      next?: unknown;
    } | null;
    if (result.error || !data)
      return machineJson({ error: 'registry_unavailable' }, 503);
    if (data.reason !== 'ok')
      return machineJson({ error: data.reason ?? 'principal_refused' }, 403);
    return machineJson({ events: data.events, next: data.next });
  }
);
