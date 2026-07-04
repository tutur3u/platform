import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canManageInventoryCatalog } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isInventoryMediaPath,
  validateFinalizedInventoryMediaUpload,
} from '@/lib/inventory-media-storage-policy';
import { WORKSPACE_STORAGE_PROVIDER_OPTIONS } from '@/lib/workspace-storage-config';
import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const inventoryMediaReadUrlSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .refine(
      (path) => isInventoryMediaPath(path),
      'path must point to inventory media'
    ),
  provider: z.enum(WORKSPACE_STORAGE_PROVIDER_OPTIONS).optional(),
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

    const parsed = inventoryMediaReadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: 'Invalid inventory media read URL payload',
          errors: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const validation = await validateFinalizedInventoryMediaUpload({
      path: parsed.data.path,
      provider: parsed.data.provider,
      wsId: authorization.value.wsId,
    });

    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message },
        { status: validation.status }
      );
    }

    const readUrl = await createWorkspaceStorageSignedReadUrl(
      authorization.value.wsId,
      parsed.data.path,
      {
        expiresIn: 31_536_000,
        provider: parsed.data.provider,
        requireExists: true,
      }
    );

    return NextResponse.json({
      readUrl,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to create inventory media read URL', error);
    return NextResponse.json(
      { message: 'Failed to create inventory media read URL' },
      { status: 500 }
    );
  }
}
