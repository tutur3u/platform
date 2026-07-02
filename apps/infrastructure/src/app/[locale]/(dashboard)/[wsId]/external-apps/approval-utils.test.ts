import type { ExternalAppRegistration } from '@tuturuuu/internal-api/infrastructure/apps';
import { describe, expect, it } from 'vitest';
import {
  buildExternalAppApprovalPayload,
  parseExternalAppApprovalSearchParams,
  sanitizeExternalAppApprovalReturnUrl,
} from './approval-utils';

const app: ExternalAppRegistration = {
  allowedScopes: ['workspace:session'],
  allowedWorkspaceIds: ['workspace-1'],
  createdAt: null,
  createdBy: null,
  displayName: 'External App',
  enabled: true,
  id: 'external-app',
  origins: ['https://external.example.com'],
  secretIssuedAt: null,
  secretLastFour: '70Kc',
  updatedAt: '2026-06-26T00:00:00.000Z',
  updatedBy: null,
};

describe('external app approval utilities', () => {
  it('parses app id and repeated requested scopes with normalization', () => {
    const parsed = parseExternalAppApprovalSearchParams({
      appId: ' External-App ',
      feature: 'managed-cron',
      origin: 'https://new-external.example.com/settings',
      returnUrl: 'https://tuturuuu.com/login',
      scope: [
        'WORKSPACE:SESSION',
        'workspace:members:read',
        'workspace:members:write',
        'workspace:roles:read',
        'workspace:roles:write',
        'workspace:cron:read',
        'workspace:cron:write',
        'users:profile:read',
        'users:profile:write',
        'bad scope',
        'users:profile:read',
      ],
      workspaceId: 'WORKSPACE-2',
    });

    expect(parsed).toEqual({
      appId: 'external-app',
      feature: 'managed-cron',
      invalidScopes: ['bad scope'],
      origin: 'https://new-external.example.com',
      requestedScopes: [
        'users:profile:read',
        'users:profile:write',
        'workspace:cron:read',
        'workspace:cron:write',
        'workspace:members:read',
        'workspace:members:write',
        'workspace:roles:read',
        'workspace:roles:write',
        'workspace:session',
      ],
      returnUrl: 'https://tuturuuu.com/login',
      workspaceId: 'workspace-2',
    });
  });

  it('builds a save payload that preserves app fields and merges missing access', () => {
    const result = buildExternalAppApprovalPayload(
      app,
      [
        'workspace:session',
        'workspace:members:read',
        'workspace:members:write',
        'workspace:roles:read',
        'workspace:roles:write',
        'workspace:cron:read',
        'workspace:cron:write',
        'users:profile:read',
        'users:profile:write',
      ],
      {
        requestedOrigin: 'https://new-external.example.com/setup',
        requestedWorkspaceId: 'workspace-2',
      }
    );

    expect(result.missingScopes).toEqual([
      'users:profile:read',
      'users:profile:write',
      'workspace:cron:read',
      'workspace:cron:write',
      'workspace:members:read',
      'workspace:members:write',
      'workspace:roles:read',
      'workspace:roles:write',
    ]);
    expect(result.missingOrigins).toEqual(['https://new-external.example.com']);
    expect(result.missingWorkspaceIds).toEqual(['workspace-2']);
    expect(result.payload).toEqual({
      allowedScopes: [
        'users:profile:read',
        'users:profile:write',
        'workspace:cron:read',
        'workspace:cron:write',
        'workspace:members:read',
        'workspace:members:write',
        'workspace:roles:read',
        'workspace:roles:write',
        'workspace:session',
      ],
      allowedWorkspaceIds: ['workspace-1', 'workspace-2'],
      displayName: 'External App',
      enabled: true,
      id: 'external-app',
      issueSecret: false,
      origins: [
        'https://external.example.com',
        'https://new-external.example.com',
      ],
    });
  });

  it('accepts Tuturuuu and registered app return origins only', () => {
    expect(
      sanitizeExternalAppApprovalReturnUrl(
        'https://tuturuuu.com/login',
        app,
        'https://tuturuuu.com'
      )
    ).toBe('https://tuturuuu.com/login');
    expect(
      sanitizeExternalAppApprovalReturnUrl(
        'https://external.example.com/login?nextUrl=%2Fsources',
        app,
        'https://tuturuuu.com'
      )
    ).toBe('https://external.example.com/login?nextUrl=%2Fsources');
    expect(
      sanitizeExternalAppApprovalReturnUrl(
        'https://attacker.example.com/login',
        app,
        'https://tuturuuu.com'
      )
    ).toBeNull();
    expect(
      sanitizeExternalAppApprovalReturnUrl(
        'https://new-external.example.com/settings?cronSetup=retry',
        app,
        'https://tuturuuu.com',
        ['https://new-external.example.com']
      )
    ).toBe('https://new-external.example.com/settings?cronSetup=retry');
  });
});
