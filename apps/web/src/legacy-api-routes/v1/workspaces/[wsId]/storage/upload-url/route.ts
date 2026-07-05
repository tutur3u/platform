import { posix } from 'node:path';
import { isReservedMobileDeploymentDrivePath } from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import {
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@tuturuuu/storage-core/workspace-storage-upload-policy';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import { validateFinanceTransactionAttachmentUploadRequest } from '@/lib/finance-transaction-storage-limits';
import {
  resolveTopicAnnouncementsAccess,
  TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES,
  TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH,
  TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES,
} from '../../topic-announcements/shared';
import type { WorkspaceStorageRouteAuthContext } from '../route-auth';
import {
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const uploadUrlSchema = z.object({
  contentType: z.string().max(255).optional(),
  filename: z.string().min(1).max(255),
  path: z.string().max(1024).optional(),
  upsert: z.boolean().optional(),
  size: z.number().int().min(0).optional(),
});

const TOPIC_ANNOUNCEMENT_EXTENSION_CONTENT_TYPES: Record<
  string,
  (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number]
> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function canCreateUploadUrlForPath(
  permissions: WorkspaceStorageRouteAuthContext['permissions']
) {
  if (!permissions) {
    return false;
  }

  return !permissions.withoutPermission('manage_drive');
}

function canOverwriteUploadUrlForPath() {
  return false;
}

function isReservedExternalProjectPath(path: string) {
  return path === 'external-projects' || path.startsWith('external-projects/');
}

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase();
}

function isReservedTopicAnnouncementPath(path: string) {
  return (
    path === 'topic-announcements' || path.startsWith('topic-announcements/')
  );
}

function resolveAllowedTopicAnnouncementContentType({
  contentType,
  filename,
}: {
  contentType?: string;
  filename: string;
}) {
  if (
    contentType &&
    TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES.includes(
      contentType as (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number]
    )
  ) {
    return contentType as (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number];
  }

  return (
    TOPIC_ANNOUNCEMENT_EXTENSION_CONTENT_TYPES[getFileExtension(filename)] ??
    null
  );
}

async function resolveTopicAnnouncementAttachmentUploadAccess({
  contentType,
  filename,
  path,
  request,
  size,
  wsId,
}: {
  contentType?: string;
  filename: string;
  path: string;
  request: Request;
  size?: number;
  wsId: string;
}): Promise<
  | {
      allowed: true;
      contentType: (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number];
    }
  | { allowed: false; response: NextResponse }
> {
  if (!isReservedTopicAnnouncementPath(path)) {
    return {
      allowed: false,
      response: NextResponse.json(
        { message: 'Not a Topic Announcement upload path' },
        { status: 404 }
      ),
    };
  }

  if (path !== TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH) {
    return {
      allowed: false,
      response: NextResponse.json(
        { message: 'Invalid Topic Announcement attachment path' },
        { status: 400 }
      ),
    };
  }

  if (size === undefined || size <= 0) {
    return {
      allowed: false,
      response: NextResponse.json(
        { message: 'File is empty' },
        { status: 400 }
      ),
    };
  }

  if (size > TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES) {
    return {
      allowed: false,
      response: NextResponse.json(
        { message: 'Attachment exceeds 10 MB limit' },
        { status: 413 }
      ),
    };
  }

  const resolvedContentType = resolveAllowedTopicAnnouncementContentType({
    contentType,
    filename,
  });
  if (!resolvedContentType) {
    return {
      allowed: false,
      response: NextResponse.json(
        { message: 'Only images and PDFs can be attached' },
        { status: 415 }
      ),
    };
  }

  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) {
    return { allowed: false, response: access.response };
  }

  return { allowed: true, contentType: resolvedContentType };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId, {
      appSessionTargets: FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions, supabase, userId } = auth.context;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = uploadUrlSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedPath = sanitizePath(parsed.data.path || '');
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }
    const requestedStoragePath = sanitizedPath
      ? posix.join(sanitizedPath, sanitizedFilename)
      : sanitizedFilename;
    if (
      isReservedMobileDeploymentDrivePath(normalizedWsId, requestedStoragePath)
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (isReservedExternalProjectPath(sanitizedPath)) {
      return NextResponse.json(
        {
          message:
            'External project uploads must use the external project asset upload route',
        },
        { status: 400 }
      );
    }

    let uploadContentType = parsed.data.contentType;
    const topicUploadAccess = isReservedTopicAnnouncementPath(sanitizedPath)
      ? await resolveTopicAnnouncementAttachmentUploadAccess({
          contentType: parsed.data.contentType,
          filename: sanitizedFilename,
          path: sanitizedPath,
          request,
          size: parsed.data.size,
          wsId,
        })
      : null;

    if (topicUploadAccess && !topicUploadAccess.allowed) {
      return topicUploadAccess.response;
    }

    if (topicUploadAccess?.allowed) {
      uploadContentType = topicUploadAccess.contentType;
    } else {
      const uploadValidation = validateWorkspaceStorageUploadMetadata({
        contentType: parsed.data.contentType,
        filename: sanitizedFilename,
        size: parsed.data.size,
      });
      if (!uploadValidation.ok) {
        return NextResponse.json(
          { message: uploadValidation.message },
          { status: uploadValidation.status }
        );
      }

      uploadContentType = uploadValidation.contentType;
    }

    const canCreateUploadUrl =
      topicUploadAccess?.allowed ||
      canCreateUploadUrlForPath(permissions) ||
      (await canAccessFinanceTransactionStoragePath({
        access: 'write',
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        supabase,
        userId,
      }));

    if (!canCreateUploadUrl) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const financeAttachmentValidation =
      await validateFinanceTransactionAttachmentUploadRequest({
        path: sanitizedPath,
        size: parsed.data.size,
        wsId: normalizedWsId,
      });
    if (!financeAttachmentValidation.ok) {
      return NextResponse.json(
        { message: financeAttachmentValidation.message },
        { status: financeAttachmentValidation.status }
      );
    }

    if (parsed.data.upsert === true && !canOverwriteUploadUrlForPath()) {
      return NextResponse.json(
        { message: 'Upload overwrite is not allowed for this path' },
        { status: 403 }
      );
    }

    const filenameWithSuffix =
      parsed.data.upsert === true
        ? sanitizedFilename
        : `${generateRandomUUID()}-${sanitizedFilename}`;

    const uploadPayload = await createWorkspaceStorageUploadPayload(
      normalizedWsId,
      filenameWithSuffix,
      {
        path: sanitizedPath,
        upsert: parsed.data.upsert ?? false,
        size: parsed.data.size,
        contentType: uploadContentType,
      }
    );

    return NextResponse.json({
      signedUrl: uploadPayload.signedUrl,
      token: uploadPayload.token,
      headers: uploadPayload.headers,
      path: uploadPayload.path,
      fullPath: uploadPayload.fullPath,
      filename: uploadPayload.filename,
      contentType: uploadPayload.contentType,
      provider: uploadPayload.provider,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Upload URL error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
