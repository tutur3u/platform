import { FileKey2 } from '@tuturuuu/icons';
import type { RolePermission } from './permissions';

/** Called only inside the existing root/full infrastructure catalog branch. */
export function deploymentVaultPermissions(
  t: (key: string) => string
): RolePermission[] {
  return [
    {
      id: 'manage_mobile_deployment_vault',
      icon: <FileKey2 />,
      title: t('ws-roles.manage_mobile_deployment_vault'),
      description: t('ws-roles.manage_mobile_deployment_vault_description'),
      disableOnProduction: false,
      disabled: false,
    },
    {
      id: 'manage_desktop_deployment_vault',
      icon: <FileKey2 />,
      title: t('ws-roles.manage_desktop_deployment_vault'),
      description: t('ws-roles.manage_desktop_deployment_vault_description'),
      disableOnProduction: false,
      disabled: false,
    },
  ];
}
