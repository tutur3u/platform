import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
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

const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_FILENAME_LENGTH = 255;

const uploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
});

type Params = {
  wsId: string;
};

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { filename } = uploadUrlRequestSchema.parse(await request.json());
      const dotIndex = filename.lastIndexOf('.');
      const extension =
        dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

      if (!extension || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
        return NextResponse.json(
          {
            error:
              'Unsupported file type. Only PNG, JPEG, and WEBP are allowed.',
          },
          { status: 400 }
        );
      }

      const sanitized = sanitizeFilename(filename) || 'template-background';
      const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${sanitized}`;
      const storagePath = `${context.wsId}/template-backgrounds/${uniqueName}`;
      const storageAdmin = await createTemplateStorageAdmin();
      const { data, error } = await storageAdmin.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (error || !data) {
        return NextResponse.json(
          { error: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        path: storagePath,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    } catch (error) {
      return handleTemplateRouteError(
        error,
        'Unexpected error in template upload-url:'
      );
    }
  },
  {
    allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH,
    rateLimit: { maxRequests: 30, windowMs: 60_000 },
  }
);
