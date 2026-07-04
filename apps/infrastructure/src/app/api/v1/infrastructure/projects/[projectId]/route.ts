import {
  deleteInfrastructureProject,
  updateInfrastructureProject,
} from '@/lib/infrastructure/projects';
import {
  handleInfrastructureProjectRequest,
  readJsonObject,
  readStringArray,
} from '../_shared';

type Params = Promise<{ projectId: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { projectId } = await params;

  return handleInfrastructureProjectRequest(
    request,
    `/api/v1/infrastructure/projects/${projectId}`,
    async () => {
      const body = await readJsonObject(request);
      return {
        project: await updateInfrastructureProject(projectId, {
          appRoot: typeof body.appRoot === 'string' ? body.appRoot : undefined,
          autoDeployEnabled:
            typeof body.autoDeployEnabled === 'boolean'
              ? body.autoDeployEnabled
              : undefined,
          cronEnabled:
            typeof body.cronEnabled === 'boolean'
              ? body.cronEnabled
              : undefined,
          hostnames: readStringArray(body.hostnames),
          logDrainEnabled:
            typeof body.logDrainEnabled === 'boolean'
              ? body.logDrainEnabled
              : undefined,
          name: typeof body.name === 'string' ? body.name : undefined,
          redisEnabled:
            typeof body.redisEnabled === 'boolean'
              ? body.redisEnabled
              : undefined,
          selectedBranch:
            typeof body.selectedBranch === 'string'
              ? body.selectedBranch
              : undefined,
        }),
      };
    },
    { access: 'operator' }
  );
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { projectId } = await params;

  return handleInfrastructureProjectRequest(
    request,
    `/api/v1/infrastructure/projects/${projectId}`,
    async () => ({
      project: await deleteInfrastructureProject(projectId),
    }),
    { access: 'operator' }
  );
}
