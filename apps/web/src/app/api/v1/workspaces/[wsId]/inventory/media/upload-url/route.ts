import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canManageInventoryCatalog } from '@/lib/inventory/permissions';
import {
  createWorkspaceStorageSignedReadUrl,
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const MAX_INVENTORY_IMAGE_BYTES = 8 * 1024 * 1024;
const INVENTORY_IMAGE_CONTENT_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
const INVENTORY_MEDIA_TARGETS = [
  'bundle-image',
  'listing-image',
  'product-featured-image',
  'storefront-hero',
] as const;

const uploadUrlSchema = z.object({
  contentType: z.enum(INVENTORY_IMAGE_CONTENT_TYPES),
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(MAX_INVENTORY_IMAGE_BYTES),
  target: z.enum(INVENTORY_MEDIA_TARGETS),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = uploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: 'Invalid inventory media payload',
          errors: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const filename = `${generateRandomUUID()}-${parsed.data.filename}`;
    const uploadPayload = await createWorkspaceStorageUploadPayload(
      authorization.value.wsId,
      filename,
      {
        contentType: parsed.data.contentType,
        path: `inventory/media/${parsed.data.target}`,
        size: parsed.data.size,
        upsert: false,
      }
    );
    const readUrl = await createWorkspaceStorageSignedReadUrl(
      authorization.value.wsId,
      uploadPayload.path,
      {
        expiresIn: 31_536_000,
        provider: uploadPayload.provider,
      }
    );

    return NextResponse.json({
      contentType: uploadPayload.contentType,
      filename: uploadPayload.filename,
      fullPath: uploadPayload.fullPath,
      headers: uploadPayload.headers,
      path: uploadPayload.path,
      provider: uploadPayload.provider,
      readUrl,
      signedUrl: uploadPayload.signedUrl,
      target: parsed.data.target,
      token: uploadPayload.token,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    serverLogger.error('Failed to create inventory media upload URL', error);
    return NextResponse.json(
      { message: 'Failed to create inventory media upload URL' },
      { status: 500 }
    );
  }
}
