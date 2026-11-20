import type { PermissionId } from '@tuturuuu/types';
import {
  CircuitBoard,
  DatabaseZap,
  Eye,
  FlaskConical,
  GitBranch,
  Newspaper,
  ScrollText,
  UserCog,
} from '@tuturuuu/icons';
import { deploymentVaultPermissions } from './deployment-vault-permissions';
import type { RolePermissionGroup } from './permissions';

/** Root-workspace infrastructure permissions; listed only in the root or full catalog. */
export function infrastructurePermissionGroup(
  t: (key: string) => string
): RolePermissionGroup {
  return {
    id: 'infrastructure',
    icon: <CircuitBoard />,
    title: t('ws-roles.infrastructure'),
    description: t('ws-roles.infrastructure_description'),
    permissions: [
      {
        id: 'view_infrastructure',
        icon: <Eye />,
        title: t('ws-roles.view_infrastructure'),
        description: t('ws-roles.view_infrastructure_description'),
        disableOnProduction: false,
        disabled: false,
      },
      {
        id: 'manage_infrastructure_stress_tests' as PermissionId,
        icon: <FlaskConical />,
        title: t('ws-roles.manage_infrastructure_stress_tests'),
        description: t(
          'ws-roles.manage_infrastructure_stress_tests_description'
        ),
        disableOnProduction: false,
        disabled: false,
      },
      {
        id: 'manage_internal_accounts' as PermissionId,
        icon: <UserCog />,
        title: t('ws-roles.manage_internal_accounts'),
        description: t('ws-roles.manage_internal_accounts_description'),
        disableOnProduction: false,
        disabled: false,
      },
      {
        id: 'manage_qa_test_users' as PermissionId,
        icon: <FlaskConical />,
        title: t('ws-roles.manage_qa_test_users'),
        description: t('ws-roles.manage_qa_test_users_description'),
        disableOnProduction: false,
        disabled: false,
      },
      {
        id: 'manage_git_repositories' as PermissionId,
        icon: <GitBranch />,
        title: t('ws-roles.manage_git_repositories'),
        description: t('ws-roles.manage_git_repositories_description'),
        disableOnProduction: false,
        disabled: false,
      },
      ...deploymentVaultPermissions(t),
      {
        id: 'manage_external_migrations',
        icon: <DatabaseZap />,
        title: t('ws-roles.manage_external_migrations'),
        description: t('ws-roles.manage_external_migrations_description'),
        disableOnProduction: false,
        disabled: false,
      },
      {
        id: 'manage_workspace_audit_logs',
        icon: <ScrollText />,
        title: t('ws-roles.manage_workspace_audit_logs'),
        description: t('ws-roles.manage_workspace_audit_logs_description'),
        disableOnProduction: true,
        disabled: true,
      },
      {
        id: 'manage_changelog',
        icon: <Newspaper />,
        title: t('ws-roles.manage_changelog'),
        description: t('ws-roles.manage_changelog_description'),
        disableOnProduction: false,
        disabled: false,
      },
    ],
  };
}
