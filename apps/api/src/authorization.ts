import type { Principal, RoutePolicy } from './contracts';
import { ApiError } from './errors';

export type AuthorizationEvidence =
  | { kind: 'identity' }
  | {
      kind: 'workspace';
      workspaceId: string;
      membership: 'active';
      permissions: readonly string[];
      objects: readonly { resource: string; id: string; workspaceId: string }[];
    };

function denied(): never {
  throw new ApiError('forbidden', 403, 'Access denied');
}

export function enforceAuthorization(
  principal: Principal,
  policy: RoutePolicy,
  params: Readonly<Record<string, string>>,
  evidence: AuthorizationEvidence
): void {
  if (policy.kind === 'deny') denied();
  if (policy.kind === 'public') return;
  if (principal.kind === 'public')
    throw new ApiError('unauthenticated', 401, 'Authentication required');
  switch (policy.kind) {
    case 'user':
      if (
        principal.kind !== 'user' ||
        (policy.requireMfa && !principal.mfaVerified)
      )
        denied();
      return;
    case 'admin':
      if (principal.kind !== 'user' || !principal.mfaVerified) denied();
      // The adapter verifies the root permission; a workspace grant is insufficient.
      if (evidence.kind !== 'identity') denied();
      return;
    case 'service':
      if (
        principal.kind !== 'service' ||
        principal.serviceId !== policy.audience
      )
        denied();
      return;
    case 'capability':
      if (principal.kind !== 'capability' || principal.scope !== policy.scope)
        denied();
      return;
    case 'workspace':
    case 'api-key':
    case 'external-app': {
      const workspaceId = params[policy.workspaceParam];
      if (
        !workspaceId ||
        evidence.kind !== 'workspace' ||
        evidence.workspaceId !== workspaceId ||
        evidence.membership !== 'active' ||
        !evidence.permissions.includes(policy.permission)
      )
        denied();
      if (
        policy.kind === 'workspace' &&
        (principal.kind !== 'user' || !principal.mfaVerified)
      )
        denied();
      if (
        policy.kind === 'api-key' &&
        (principal.kind !== 'api-key' ||
          principal.workspaceId !== workspaceId ||
          !principal.permissions.includes(policy.permission))
      )
        denied();
      if (
        policy.kind === 'external-app' &&
        (principal.kind !== 'external-app' ||
          principal.workspaceId !== workspaceId ||
          !principal.permissions.includes(policy.permission))
      )
        denied();
      if ('object' in policy && policy.object) {
        const objectId = params[policy.object.param];
        if (
          !objectId ||
          !evidence.objects.some(
            (object) =>
              object.id === objectId &&
              object.resource === policy.object?.resource &&
              object.workspaceId === workspaceId
          )
        )
          denied();
      }
      return;
    }
    default: {
      const exhaustive: never = policy;
      throw new Error(`Unknown policy: ${exhaustive}`);
    }
  }
}
