import { syncInfrastructureProject } from '@/lib/infrastructure/projects';
import { handleInfrastructureProjectRequest } from '../../_shared';

type Params = Promise<{ projectId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const { projectId } = await params;

  return handleInfrastructureProjectRequest(
    request,
    `/api/v1/infrastructure/projects/${projectId}/sync`,
    async () => ({
      project: await syncInfrastructureProject(projectId),
    })
  );
}
