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
  displayName: 'CyberShield 35',
  enabled: true,
  id: 'cybershield35',
  origins: ['https://cybershield.example.com'],
  secretIssuedAt: null,
  secretLastFour: '70Kc',
  updatedAt: '2026-06-26T00:00:00.000Z',
  updatedBy: null,
};

describe('external app approval utilities', () => {
  it('parses app id and repeated requested scopes with normalization', () => {
    const parsed = parseExternalAppApprovalSearchParams({
      appId: ' CyberShield35 ',
      returnUrl: 'https://tuturuuu.com/login',
      scope: [
        'WORKSPACE:SESSION',
        'users:profile:read',
        'users:profile:write',
        'bad scope',
        'users:profile:read',
      ],
    });

    expect(parsed).toEqual({
      appId: 'cybershield35',
      invalidScopes: ['bad scope'],
      requestedScopes: [
        'users:profile:read',
        'users:profile:write',
        'workspace:session',
      ],
      returnUrl: 'https://tuturuuu.com/login',
    });
  });

  it('builds a save payload that preserves app fields and merges missing scopes', () => {
    const result = buildExternalAppApprovalPayload(app, [
      'workspace:session',
      'users:profile:read',
      'users:profile:write',
    ]);

    expect(result.missingScopes).toEqual([
      'users:profile:read',
      'users:profile:write',
    ]);
    expect(result.payload).toEqual({
      allowedScopes: [
        'users:profile:read',
        'users:profile:write',
        'workspace:session',
      ],
      allowedWorkspaceIds: ['workspace-1'],
      displayName: 'CyberShield 35',
      enabled: true,
      id: 'cybershield35',
      issueSecret: false,
      origins: ['https://cybershield.example.com'],
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
        'https://cybershield.example.com/login?nextUrl=%2Fsources',
        app,
        'https://tuturuuu.com'
      )
    ).toBe('https://cybershield.example.com/login?nextUrl=%2Fsources');
    expect(
      sanitizeExternalAppApprovalReturnUrl(
        'https://attacker.example.com/login',
        app,
        'https://tuturuuu.com'
      )
    ).toBeNull();
  });
});
