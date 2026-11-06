import type {
  Database,
  WorkspaceDefaultPermissionMemberType,
} from '@tuturuuu/types';
import { MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';

export type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

export const ADMIN_ROLE_NAME = 'External App Admin';
export const ADMIN_PERMISSION_SET = [
  'manage_workspace_members',
  'manage_workspace_roles',
] as const satisfies readonly WorkspaceRolePermissionValue[];
export const ADMIN_PERMISSION_LOOKUP = new Set<WorkspaceRolePermissionValue>(
  ADMIN_PERMISSION_SET
);
export const BROAD_ADMIN_PERMISSION =
  'admin' satisfies WorkspaceRolePermissionValue;
export const MEMBER_DEFAULT_TYPE =
  'MEMBER' satisfies WorkspaceDefaultPermissionMemberType;

export const removeAccessSchema = z
  .object({
    email: z.string().email().max(MAX_EMAIL_LENGTH).optional(),
    userId: z.string().trim().pipe(z.guid().toLowerCase()).optional(),
  })
  .refine((value) => Boolean(value.email || value.userId), {
    message: 'Missing member identifier',
  });

export const rolePatchSchema = z.object({
  confirmDefaultAdminDisable: z.boolean().optional(),
  role: z.enum(['admin', 'member']),
});

export const defaultAdminSchema = z.object({
  enabled: z.boolean(),
});
