import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createTaskTemplate,
  createTaskTemplateSchema,
  createTaskTemplatesRouteContext,
  handleUnknownTaskTemplateError,
  listTaskTemplates,
  readJson,
  TASK_TEMPLATES_APP_SESSION_AUTH,
} from './_lib';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      return await listTaskTemplates(request, context);
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error listing task templates'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const parsed = createTaskTemplateSchema.parse(await readJson(request));
      return await createTaskTemplate(context, parsed);
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error creating task template'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);
