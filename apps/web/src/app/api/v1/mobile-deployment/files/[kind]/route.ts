import { NextResponse } from 'next/server';
import {
  authorizeMobileDeploymentAdmin,
  validateMultipartMutation,
} from '@/lib/mobile-deployment/access';
import {
  MobileDeploymentStoreError,
  uploadMobileDeploymentFile,
} from '@/lib/mobile-deployment/store';
import { assertMobileDeploymentFileKind } from '@/lib/mobile-deployment/validation';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  if (error instanceof MobileDeploymentStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to upload mobile deployment file' },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const mutationError = validateMultipartMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { kind: rawKind } = await params;
  const kind = assertMobileDeploymentFileKind(rawKind);
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Missing file' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await uploadMobileDeploymentFile({
        buffer: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || 'application/octet-stream',
        db: access.db,
        filename: file.name,
        kind,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
