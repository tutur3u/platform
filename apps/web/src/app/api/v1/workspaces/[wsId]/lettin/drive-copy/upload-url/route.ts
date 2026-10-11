import { createWorkspaceStorageUploadPayload } from '@tuturuuu/storage-core/workspace-storage-provider';
import { NextResponse } from 'next/server';
import { authorizeCopy, copyError, invalidCopy, uploadInput } from '../shared';

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
    const input = uploadInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return invalidCopy();
    if (input.data.expectedActor !== auth.context.userId)
      return invalidCopy(409);
    const payload = await createWorkspaceStorageUploadPayload(
      auth.context.normalizedWsId,
      input.data.filename,
      {
        path: 'Lettin',
        upsert: false,
        contentType: 'application/json',
        size: input.data.size,
      }
    );
    return NextResponse.json(payload);
  } catch (error) {
    return copyError(error);
  }
}
