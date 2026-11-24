import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { TaskDetailRouteAuthContext } from '../taskId/access';
import { jsonError, requireTaskScope, type TaskScope } from './access';
import { inferTaskLink } from './github-links';
import { createLinkSchema, linkParamsSchema } from './schemas';

type TaskContext = { params: Promise<{ wsId: string; taskId: string }> };
type LinkContext = {
  params: Promise<{ wsId: string; taskId: string; linkId: string }>;
};

export type TaskLink = {
  id: string | null;
  kind: string;
  provider: string;
  url: string;
  external_id: string | null;
  title: string | null;
  state: string | null;
  created_at: string | null;
  created_by: string | null;
  /** True for entries that only exist in the legacy task_resources list. */
  legacy?: true;
};

type TaskLinkRow = Omit<TaskLink, 'legacy'> & { id: string };

const LINK_COLUMNS =
  'id, kind, provider, url, external_id, title, state, created_at, created_by';

function handleError(error: unknown, label: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Invalid request data', details: error.issues },
      { status: 400 }
    );
  }
  console.error(`Error in ${label}:`, error);
  return jsonError('Internal server error', 500);
}

/**
 * Legacy `tasks.task_resources` entries ({kind: 'link', url, title}) surface
 * as plain web links; a rich task_links row for the same URL wins.
 */
export function mergeLegacyResources(
  links: TaskLinkRow[],
  resources: unknown
): TaskLink[] {
  const seen = new Set(links.map((link) => link.url));
  const merged: TaskLink[] = [...links];
  if (!Array.isArray(resources)) return merged;
  for (const entry of resources) {
    if (!entry || typeof entry !== 'object') continue;
    const { kind, url, title } = entry as Record<string, unknown>;
    if (kind !== 'link' || typeof url !== 'string' || seen.has(url)) continue;
    seen.add(url);
    merged.push({
      id: null,
      kind: 'url',
      provider: 'web',
      url,
      external_id: null,
      title: typeof title === 'string' && title ? title : null,
      state: null,
      created_at: null,
      created_by: null,
      legacy: true,
    });
  }
  return merged;
}

/** GET .../tasks/:taskId/links: active links plus legacy resources. */
export async function handleTaskLinksGET(
  request: NextRequest,
  context: TaskContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const scope = await requireTaskScope(request, await context.params, auth);
    if ('error' in scope) return scope.error;

    const [links, task] = await Promise.all([
      scope.admin
        .schema('private')
        .from('task_links')
        .select(LINK_COLUMNS)
        .eq('task_id', scope.taskId)
        .eq('ws_id', scope.wsId)
        .is('removed_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(200),
      scope.admin
        .from('tasks')
        .select('task_resources')
        .eq('id', scope.taskId)
        .maybeSingle(),
    ]);
    if (links.error || task.error) {
      return jsonError('Failed to load links', 500);
    }
    return NextResponse.json({
      links: mergeLegacyResources(
        (links.data ?? []) as TaskLinkRow[],
        task.data?.task_resources
      ),
    });
  } catch (error) {
    return handleError(error, 'task links GET');
  }
}

async function findActiveLink(scope: TaskScope, url: string) {
  return scope.admin
    .schema('private')
    .from('task_links')
    .select('id')
    .eq('task_id', scope.taskId)
    .eq('url', url)
    .is('removed_at', null)
    .maybeSingle();
}

/** POST .../tasks/:taskId/links: upserts on the active (task, url). */
export async function handleTaskLinksPOST(
  request: NextRequest,
  context: TaskContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const scope = await requireTaskScope(request, await context.params, auth, {
      permission: 'edit',
    });
    if ('error' in scope) return scope.error;

    const input = createLinkSchema.parse(await request.json());
    const inferred = inferTaskLink(input.url);
    const matchedGithub = inferred.provider === 'github';
    const fields = {
      kind: matchedGithub ? inferred.kind : (input.kind ?? 'url'),
      provider: matchedGithub ? ('github' as const) : ('web' as const),
      external_id: input.external_id ?? inferred.externalId,
      title: input.title ?? null,
      state: input.state ?? null,
    };

    const save = async () => {
      const existing = await findActiveLink(scope, input.url);
      if (existing.error) return { error: existing.error, created: false };
      if (existing.data) {
        const { data, error } = await scope.admin
          .schema('private')
          .from('task_links')
          .update({
            ...fields,
            title: fields.title ?? undefined,
            state: fields.state ?? undefined,
          })
          .eq('id', existing.data.id)
          .eq('task_id', scope.taskId)
          .is('removed_at', null)
          .select(LINK_COLUMNS)
          .maybeSingle();
        return { data, error, created: false };
      }
      const { data, error } = await scope.admin
        .schema('private')
        .from('task_links')
        .insert({
          ...fields,
          task_id: scope.taskId,
          ws_id: scope.wsId,
          url: input.url,
          created_by: scope.user.id,
        })
        .select(LINK_COLUMNS)
        .single();
      return { data, error, created: true };
    };

    let result = await save();
    // A concurrent insert of the same URL loses the unique index race; the
    // retry takes the update path.
    if (result.error && (result.error as { code?: string }).code === '23505') {
      result = await save();
    }
    if (result.error || !result.data)
      return jsonError('Failed to save link', 500);
    return NextResponse.json(
      { link: result.data as TaskLinkRow },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    return handleError(error, 'task links POST');
  }
}

/** DELETE .../tasks/:taskId/links/:linkId: soft remove. */
export async function handleTaskLinkDELETE(
  request: NextRequest,
  context: LinkContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const params = linkParamsSchema.parse(await context.params);
    const scope = await requireTaskScope(request, params, auth, {
      permission: 'edit',
    });
    if ('error' in scope) return scope.error;

    const { data, error } = await scope.admin
      .schema('private')
      .from('task_links')
      .update({
        removed_at: new Date().toISOString(),
        removed_by: scope.user.id,
      })
      .eq('id', params.linkId)
      .eq('task_id', scope.taskId)
      .eq('ws_id', scope.wsId)
      .is('removed_at', null)
      .select('id')
      .maybeSingle();
    if (error) return jsonError('Failed to remove link', 500);
    if (!data) return jsonError('Link not found', 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'task link DELETE');
  }
}
