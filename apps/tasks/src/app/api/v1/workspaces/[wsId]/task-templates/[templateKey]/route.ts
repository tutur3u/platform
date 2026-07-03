import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  buildTaskTemplateUpdate,
  createTaskTemplatesRouteContext,
  handleUnknownTaskTemplateError,
  isUniqueViolation,
  jsonError,
  readJson,
  requireWorkspaceTemplateMutation,
  resolveTaskTemplate,
  serializeTaskTemplate,
  TASK_TEMPLATES_APP_SESSION_AUTH,
  taskTemplatesTable,
  updateTaskTemplateSchema,
} from '../_lib';

type Params = {
  templateKey: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (_request: NextRequest, auth, { templateKey, wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const resolved = await resolveTaskTemplate(context, templateKey);
      if (resolved.error) return resolved.error;

      return NextResponse.json({
        template: serializeTaskTemplate(resolved.template, context.user.id),
      });
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error reading task template'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);

export const PATCH = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateKey, wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const resolved = await resolveTaskTemplate(context, templateKey, {
        includeArchived: true,
      });
      if (resolved.error) return resolved.error;

      if (resolved.template.created_by !== context.user.id) {
        return jsonError('Task template not found', 404);
      }

      const parsed = updateTaskTemplateSchema.parse(await readJson(request));
      const nextVisibility = parsed.visibility ?? resolved.template.visibility;
      const forbidden =
        requireWorkspaceTemplateMutation(
          context,
          resolved.template.visibility
        ) ?? requireWorkspaceTemplateMutation(context, nextVisibility);
      if (forbidden) return forbidden;

      const update = buildTaskTemplateUpdate(parsed);
      if (Object.keys(update).length === 0) {
        return NextResponse.json({
          template: serializeTaskTemplate(resolved.template, context.user.id),
        });
      }

      const { data, error } = (await taskTemplatesTable(context.sbAdmin)
        .update(update)
        .eq('id', resolved.template.id)
        .eq('ws_id', context.wsId)
        .eq('created_by', context.user.id)
        .select('*')
        .maybeSingle()) as {
        data: typeof resolved.template | null;
        error: unknown;
      };

      if (isUniqueViolation(error)) {
        return jsonError(
          'A task template with this key already exists',
          409,
          'TASK_TEMPLATE_KEY_EXISTS'
        );
      }

      if (error) {
        return jsonError('Failed to update task template', 500);
      }

      if (!data) {
        return jsonError('Task template not found', 404);
      }

      return NextResponse.json({
        template: serializeTaskTemplate(data, context.user.id),
      });
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error updating task template'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateKey, wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const resolved = await resolveTaskTemplate(context, templateKey, {
        includeArchived: true,
      });
      if (resolved.error) return resolved.error;

      if (resolved.template.created_by !== context.user.id) {
        return jsonError('Task template not found', 404);
      }

      const forbidden = requireWorkspaceTemplateMutation(
        context,
        resolved.template.visibility
      );
      if (forbidden) return forbidden;

      const permanent =
        new URL(request.url).searchParams.get('permanent') === 'true';

      const mutation = permanent
        ? taskTemplatesTable(context.sbAdmin).delete()
        : taskTemplatesTable(context.sbAdmin).update({
            archived_at: new Date().toISOString(),
          });

      const { data, error } = (await mutation
        .eq('id', resolved.template.id)
        .eq('ws_id', context.wsId)
        .eq('created_by', context.user.id)
        .select('id')
        .maybeSingle()) as {
        data: { id: string } | null;
        error: unknown;
      };

      if (error) {
        return jsonError('Failed to delete task template', 500);
      }

      if (!data) {
        return jsonError('Task template not found', 404);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error deleting task template'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);
