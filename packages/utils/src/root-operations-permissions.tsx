import { BrainCircuit, UserCog } from '@tuturuuu/icons';
import type { RolePermission } from './permissions';

/** Called only inside the existing root/full infrastructure catalog branch. */
export function rootOperationsPermissions(
  t: (key: string) => string
): RolePermission[] {
  return [
    {
      id: 'manage_internal_accounts',
      icon: <UserCog />,
      title: t('ws-roles.manage_internal_accounts'),
      description: t('ws-roles.manage_internal_accounts_description'),
      disableOnProduction: false,
      disabled: false,
    },
    {
      // Granted only through the audited database procedure, never here.
      id: 'manage_mastermind',
      icon: <BrainCircuit />,
      title: t('ws-roles.manage_mastermind'),
      description: t('ws-roles.manage_mastermind_description'),
      disableOnProduction: false,
      disabled: true,
    },
  ];
}
