import { triggerWorkspaceStorageAutoExtract } from '@tuturuuu/storage-core/workspace-storage-auto-extract';
import {
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { NextResponse } from 'next/server';
import {
  authorizeCopy,
  copyByteLimit,
  copyError,
  finalizeInput,
  invalidCopy,
} from '../shared';

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ wsId: string }>;
  }
) {
  try {
    const auth = await authorizeCopy(request, (await params).wsId);
    if (!auth.ok) return auth.response;
    const input = finalizeInput.safeParse(
      await request.json().catch(() => null)
    );
    if (!input.success) return invalidCopy();
    const value = input.data;
    if (value.expectedActor !== auth.context.userId) return invalidCopy(409);
    if (value.path !== `Lettin/${value.originalFilename}`) return invalidCopy();
    const workspaceId = auth.context.normalizedWsId;
    const current = await resolveWorkspaceStorageProvider(workspaceId);
    if (current.misconfigured || current.provider !== value.provider)
      return invalidCopy(409);
    const metadata = await getWorkspaceStorageObjectMetadataForProvider(
      workspaceId,
      current.provider,
      value.path
    );
    if (
      metadata.provider !== current.provider ||
      metadata.path !== value.path ||
      metadata.contentType !== 'application/json' ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      metadata.size > copyByteLimit
    )
      return invalidCopy(409);
    const autoExtract = await triggerWorkspaceStorageAutoExtract(workspaceId, {
      path: value.path,
      contentType: 'application/json',
      originalFilename: value.originalFilename,
      requestOrigin: new URL(request.url).origin,
    });
    return NextResponse.json({
      message: 'Upload finalized successfully',
      autoExtract,
    });
  } catch (error) {
    return copyError(error);
  }
}
