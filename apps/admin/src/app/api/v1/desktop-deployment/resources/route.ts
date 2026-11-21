import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeDesktopAdmin,
  desktopAdminFailure,
  validateDesktopMutation,
} from '@/lib/desktop-deployment/access';
import { saveDesktopResource } from '@/lib/desktop-deployment/mutations';
import { readDesktopBody } from '@/lib/desktop-deployment/request';
import {
  DesktopAdminStoreError,
  listDesktopVaultState,
} from '@/lib/desktop-deployment/store';

export async function POST(request: Request) {
  const csrf = validateDesktopMutation(request);
  if (csrf) return csrf;
  const access = await authorizeDesktopAdmin(request);
  if (!access.ok) return access.response;
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;'))
    return desktopAdminFailure(415, 'desktop_request_invalid');
  let body: Buffer | undefined;
  let bytes: Buffer | undefined;
  try {
    body = await readDesktopBody(request, 2097152 + 16384);
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(body), {
        headers: { 'Content-Type': contentType },
      }).formData();
    } catch {
      return desktopAdminFailure(400, 'desktop_request_invalid');
    }
    if (
      Array.from(form.keys()).length !== 4 ||
      ['versionId', 'revision', 'name', 'file'].some(
        (key) => form.getAll(key).length !== 1
      )
    )
      return desktopAdminFailure(400, 'desktop_request_invalid');
    const parsed = z
      .object({
        versionId: z.uuid(),
        revision: z.coerce
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        name: z.string().max(80),
      })
      .safeParse({
        versionId: form.get('versionId'),
        revision: form.get('revision'),
        name: form.get('name'),
      });
    const file = form.get('file');
    if (
      !parsed.success ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 2097152
    )
      return desktopAdminFailure(400, 'desktop_resource_invalid');
    bytes = Buffer.from(await file.arrayBuffer());
    await saveDesktopResource(access.db, access.userId, {
      ...parsed.data,
      bytes,
      kind: 'file',
    });
    return NextResponse.json(
      { state: await listDesktopVaultState(access.db) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof DesktopAdminStoreError)
      return desktopAdminFailure(error.status, error.code);
    return desktopAdminFailure(500, 'desktop_operation_unavailable');
  } finally {
    body?.fill(0);
    bytes?.fill(0);
  }
}
