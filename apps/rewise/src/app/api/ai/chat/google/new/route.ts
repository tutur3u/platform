import { createPOST } from '@tuturuuu/ai/chat/google/new/route';
import { resolveRewiseGatewayAuth } from '../route-auth';

const resolveGatewayAuth = (request: Request) =>
  resolveRewiseGatewayAuth(request, { targetApp: 'rewise' });

const POST = createPOST({
  requireWorkspaceId: true,
  resolveGatewayAuth,
});

export { POST };
