import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  createTemplateStorageAdmin,
  handleTemplateRouteError,
} from '../_lib';

const deleteBackgroundSchema = z.object({
  path: z.string().min(1),
});

type Params = {
  wsId: string;
};

export const DELETE = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { path } = deleteBackgroundSchema.parse(await request.json());

      if (!path.startsWith(`${context.wsId}/template-backgrounds/`)) {
        return NextResponse.json(
          { error: 'Invalid background path' },
          { status: 400 }
        );
      }

      const storageAdmin = await createTemplateStorageAdmin();
      const { error } = await storageAdmin.storage
        .from('workspaces')
        .remove([path]);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to delete background image' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleTemplateRouteError(
        error,
        'Unexpected error deleting template background:'
      );
    }
  },
  {
    allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH,
    rateLimit: { maxRequests: 30, windowMs: 60_000 },
  }
);
