import { publishPageAndPurge } from '@/lib/external-projects/publish-page';
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
      publishPageAndPurge(access.admin, {
        ...scope,
        actorId: access.user.id,
        siteId: access.binding.canonical_id ?? '',
        versionId: scope.versionId ?? '',
      })
  );
}
