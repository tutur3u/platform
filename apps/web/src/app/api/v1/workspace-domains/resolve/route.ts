import { handleWorkspaceDomainEdgeRequest } from '@/lib/workspace-domains/edge-route';

export function GET(request: Request) {
  return handleWorkspaceDomainEdgeRequest(request, 'resolve');
}
