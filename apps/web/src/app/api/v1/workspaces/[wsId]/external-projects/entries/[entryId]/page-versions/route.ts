import { connection } from 'next/server';
import {
  listPageVersions,
  savePageVersionDraft,
  savePageVersionSchema,
} from '@/lib/external-projects/page-versions';
import { handlePageVersionRequest, type PageVersionParams } from './respond';

export async function GET(request: Request, context: PageVersionParams) {
  await connection();
  return handlePageVersionRequest(request, context, 'edit', (access, scope) =>
    listPageVersions(access.admin, scope)
  );
}

export async function POST(request: Request, context: PageVersionParams) {
  return handlePageVersionRequest(
    request,
    context,
    'edit',
    async (access, scope) =>
      savePageVersionDraft(access.admin, {
        ...scope,
        actorId: access.user.id,
        input: savePageVersionSchema.parse(await request.json()),
      }),
    201
  );
}
