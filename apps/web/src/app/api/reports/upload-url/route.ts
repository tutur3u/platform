import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ALLOWED_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

const allowedMediaTypesSet = new Set(ALLOWED_MEDIA_TYPES);

const uploadFileSchema = z.object({
  filename: z.string().min(1).max(MAX_NAME_LENGTH),
  contentType: z.enum(ALLOWED_MEDIA_TYPES),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});

const uploadUrlSchema = z.union([
  uploadFileSchema,
  z.object({
    files: z.array(uploadFileSchema).min(1).max(5),
  }),
]);

const deleteUploadsSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(1024)).min(1).max(5),
});

type UploadFileInput = z.infer<typeof uploadFileSchema>;

async function createUploadTarget(
  sbStorageAdmin: TypedSupabaseClient,
  userId: string,
  file: UploadFileInput
) {
  if (!allowedMediaTypesSet.has(file.contentType)) {
    throw new Error('Unsupported file type');
  }

  const sanitizedFilename = sanitizeFilename(file.filename);
  if (!sanitizedFilename) {
    throw new Error('Invalid filename');
  }

  const storagePath = `${userId}/${generateRandomUUID()}-${sanitizedFilename}`;

  const { data, error } = await sbStorageAdmin.storage
    .from('support_inquiries')
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data?.signedUrl || !data?.token) {
    throw new Error('Failed to generate upload URL');
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  };
}

function normalizeFiles(payload: z.infer<typeof uploadUrlSchema>) {
  if ('files' in payload) {
    return { files: payload.files, batched: true as const };
  }

  return { files: [payload], batched: false as const };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const parsed = uploadUrlSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: 'Invalid request body',
          errors: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { files, batched } = normalizeFiles(parsed.data);
    const sbStorageAdmin = await createDynamicAdminClient();

    const uploads = await Promise.all(
      files.map((file) => createUploadTarget(sbStorageAdmin, user.id, file))
    );

    if (!batched) {
      const firstUpload = uploads[0];

      if (!firstUpload) {
        return NextResponse.json(
          { message: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json(firstUpload);
    }

    return NextResponse.json({ uploads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (message === 'Unsupported file type' || message === 'Invalid filename') {
      return NextResponse.json({ message }, { status: 400 });
    }

    if (message === 'Failed to generate upload URL') {
      console.error('Error creating support report upload URL:', error);
      return NextResponse.json(
        { message: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    console.error('Support report upload-url error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const parsed = deleteUploadsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const normalizedPaths = parsed.data.paths.map((path) =>
      path.trim().replace(/^\/+/, '')
    );

    const hasInvalidPath = normalizedPaths.some(
      (path) => !path || path.includes('..') || !path.startsWith(`${user.id}/`)
    );

    if (hasInvalidPath) {
      return NextResponse.json(
        { message: 'One or more media paths are invalid for this user' },
        { status: 403 }
      );
    }

    const sbStorageAdmin = await createDynamicAdminClient();
    const { error } = await sbStorageAdmin.storage
      .from('support_inquiries')
      .remove(normalizedPaths);

    if (error) {
      console.error('Error deleting support report media:', error);
      return NextResponse.json(
        { message: 'Failed to delete uploaded media' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Support report upload cleanup error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
