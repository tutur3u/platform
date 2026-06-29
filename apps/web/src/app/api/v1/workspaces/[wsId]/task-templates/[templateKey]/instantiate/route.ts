import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createTaskTemplatesRouteContext,
  handleUnknownTaskTemplateError,
  instantiateTaskTemplate,
  instantiateTaskTemplateSchema,
  readJson,
  resolveTaskTemplate,
  TASK_TEMPLATES_APP_SESSION_AUTH,
} from '../../_lib';

type Params = {
  templateKey: string;
  wsId: string;
};

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateKey, wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const resolved = await resolveTaskTemplate(context, templateKey);
      if (resolved.error) return resolved.error;

      const parsed = instantiateTaskTemplateSchema.parse(
        await readJson(request)
      );

      return await instantiateTaskTemplate(context, resolved.template, parsed);
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error instantiating task template'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);
