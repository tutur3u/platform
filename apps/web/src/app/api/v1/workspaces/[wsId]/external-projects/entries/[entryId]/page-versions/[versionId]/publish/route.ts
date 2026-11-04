import { publishPageVersion } from '@/lib/external-projects/page-versions';
import {
  handlePageVersionRequest,
  type PageVersionParams,
} from '../../respond';

export async function POST(request: Request, context: PageVersionParams) {
  return handlePageVersionRequest(
    request,
    context,
    'publish',
    (access, scope) =>
      publishPageVersion(access.admin, {
        ...scope,
        actorId: access.user.id,
        versionId: scope.versionId ?? '',
      })
  );
}
