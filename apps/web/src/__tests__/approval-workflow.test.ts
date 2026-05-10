import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { permissions } from '@tuturuuu/utils/permissions';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS,
  type ApprovalStatus,
  canRemoveApproval,
} from '@/app/[locale]/(dashboard)/[wsId]/users/approvals/utils';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

describe('Post Approval Workflow', () => {
  describe('Approval Revoke Guard', () => {
    it.each([
      {
        status: 'PENDING' as ApprovalStatus,
        can_remove_approval: false,
        expected: false,
      },
      {
        status: 'APPROVED' as ApprovalStatus,
        can_remove_approval: true,
        expected: true,
      },
      {
        status: 'APPROVED' as ApprovalStatus,
        can_remove_approval: false,
        expected: false,
      },
      {
        status: 'REJECTED' as ApprovalStatus,
        can_remove_approval: false,
        expected: false,
      },
    ])('should return $expected when post state is revocable=$can_remove_approval status=$status', ({
      status,
      can_remove_approval,
      expected,
    }) => {
      const mockPost = {
        id: 'post-1',
        post_approval_status: status,
        can_remove_approval,
        title: 'Test Post',
      };

      expect(canRemoveApproval(mockPost)).toBe(expected);
    });
  });

  describe('Report Export Guard', () => {
    it('should block export when report is not approved', async () => {
      const mockReport = {
        id: 'report-1',
        approval_status: 'PENDING',
        title: 'Test Report',
      };

      const canExport = (report: typeof mockReport) => {
        return report.approval_status === 'APPROVED';
      };

      expect(canExport(mockReport)).toBe(false);
    });

    it('should allow export when report is approved', async () => {
      const mockReport = {
        id: 'report-1',
        approval_status: 'APPROVED',
        title: 'Test Report',
      };

      const canExport = (report: typeof mockReport) => {
        return report.approval_status === 'APPROVED';
      };

      expect(canExport(mockReport)).toBe(true);
    });
  });

  describe('Approval Status Values', () => {
    it('should have correct approval status enum values', () => {
      const expectedStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'];

      // Verify all expected statuses are defined in the APPROVAL_STATUS object
      const actualStatuses = Object.values(APPROVAL_STATUS);
      expectedStatuses.forEach((status) => {
        expect(actualStatuses).toContain(status);
      });

      // Verify all APPROVAL_STATUS values are in expectedStatuses
      actualStatuses.forEach((status) => {
        expect(expectedStatuses).toContain(status);
      });
    });
  });
});

describe('Permission Integration', () => {
  it('includes every workspace role permission enum value in the roles UI catalog', () => {
    const supabaseTypes = readFileSync(
      resolve(repoRoot, 'packages/types/src/supabase.ts'),
      'utf8'
    );
    const enumBlock = supabaseTypes.match(
      /workspace_role_permission:\n([\s\S]*?)\n\s*zalopay_tier:/
    )?.[1];

    expect(enumBlock).toBeDefined();

    const enumPermissionIds = Array.from(
      enumBlock?.matchAll(/'([^']+)'/g) ?? [],
      (match) => match[1]
    );

    const actualPermissionIds = permissions({
      wsId: ROOT_WORKSPACE_ID,
      user: {
        id: 'root-user',
        email: 'ops@tuturuuu.com',
        app_metadata: {},
        user_metadata: {},
        aud: '',
        created_at: '',
      },
    }).map((permission) => permission.id);

    expect(new Set(actualPermissionIds).size).toBe(actualPermissionIds.length);

    for (const permissionId of enumPermissionIds) {
      expect(actualPermissionIds).toContain(permissionId);
    }
  });

  it('should include required approval permissions in the permission system', () => {
    const requiredPermissions = [
      'approve_reports',
      'approve_posts',
      'create_user_groups_reports',
      'update_user_groups_reports',
      'send_user_group_post_emails',
    ];

    // Get actual permissions from the permissions system
    const testWsId = '00000000-0000-0000-0000-000000000001';
    const testUser = null;
    const actualPermissions = permissions({ wsId: testWsId, user: testUser });
    const actualPermissionIds = actualPermissions.map((p) => p.id);

    // Verify each required permission exists in the actual permission system
    requiredPermissions.forEach((permission) => {
      expect(actualPermissionIds).toContain(permission);
    });
  });
});
