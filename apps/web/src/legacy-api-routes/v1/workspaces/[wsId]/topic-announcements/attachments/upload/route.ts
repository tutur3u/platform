import { posix } from 'node:path';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import {
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  resolveTopicAnnouncementsAccess,
  TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES,
  TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES,
} from '../../shared';

const EXTENSION_CONTENT_TYPES: Record<
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

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase();
}

function resolveAllowedContentType(file: File) {
  if (
    TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES.includes(
      file.type as (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number]
    )
  ) {
    return file.type as (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number];
  }

  return EXTENSION_CONTENT_TYPES[getFileExtension(file.name)] ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const access = await resolveTopicAnnouncementsAccess(request, wsId, {
      requireManage: true,
    });
    if (access.response) return access.response;

    const { normalizedWsId } = access.context;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Missing file' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ message: 'File is empty' }, { status: 400 });
    }
    if (file.size > TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { message: 'Attachment exceeds 10 MB limit' },
        { status: 413 }
      );
    }

    const contentType = resolveAllowedContentType(file);
    if (!contentType) {
      return NextResponse.json(
        { message: 'Only images and PDFs can be attached' },
        { status: 415 }
      );
    }

    const sanitizedFilename = sanitizeFilename(file.name);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    const storageProvider = (
      await resolveWorkspaceStorageProvider(normalizedWsId)
    ).provider;
    const storagePath = posix.join(
      'topic-announcements',
      'attachments',
      `${generateRandomUUID()}-${sanitizedFilename}`
    );
    const data = await uploadWorkspaceStorageFileDirect(
      normalizedWsId,
      storagePath,
      new Uint8Array(await file.arrayBuffer()),
      {
        contentType,
        upsert: false,
      }
    );

    return NextResponse.json(
      {
        data: {
          contentType,
          fileName: sanitizedFilename,
          sizeBytes: file.size,
          storagePath: data.path,
          storageProvider,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    await console.error('Topic announcement attachment upload failed', {
      error,
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
