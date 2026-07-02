import {
  createInfrastructureProject,
  listInfrastructureProjects,
} from '@/lib/infrastructure/projects';
import {
  handleInfrastructureProjectRequest,
  readJsonObject,
  readStringArray,
} from './_shared';

export async function GET(request: Request) {
  return handleInfrastructureProjectRequest(
    request,
    '/api/v1/infrastructure/projects',
    async () => ({
      projects: await listInfrastructureProjects(),
    })
  );
}

export async function POST(request: Request) {
  return handleInfrastructureProjectRequest(
    request,
    '/api/v1/infrastructure/projects',
    async () => {
      const body = await readJsonObject(request);
      if (typeof body.repoUrl !== 'string') {
        throw new Error('GitHub repository URL is required.');
      }

      return {
        project: await createInfrastructureProject({
          appRoot: typeof body.appRoot === 'string' ? body.appRoot : undefined,
          hostnames: readStringArray(body.hostnames),
          repoUrl: body.repoUrl,
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
