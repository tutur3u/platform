import { connection } from 'next/server';
import { getPageVersion } from '@/lib/external-projects/page-versions';
import { handlePageVersionRequest, type PageVersionParams } from '../respond';

export async function GET(request: Request, context: PageVersionParams) {
  await connection();
  return handlePageVersionRequest(request, context, 'edit', (access, scope) =>
    getPageVersion(access.admin, {
      ...scope,
      versionId: scope.versionId ?? '',
    })
  );
}
