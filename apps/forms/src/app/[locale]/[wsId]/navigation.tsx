import { ClipboardList, Plus } from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

/**
 * Navigation for the Forms satellite (forms.tuturuuu.com). Ported from the
 * `id:'forms'` block of apps/web's dashboard navigation, flattened to top-level
 * items (this whole app is the forms surface). Feature URLs are kept identical
 * to web (`/{wsId}/forms/...`) so the ported pages and API routes stay 1:1.
 * Icons are plain JSX (satellites don't use web's icon descriptor
 * serialization) and permission gates use the shared PermissionsResult, mirroring
 * the `manage_forms` / `view_form_analytics` checks the pages already perform.
 */
export async function getNavigationLinks({
  permissions,
  personalOrWsId,
}: {
  permissions?: PermissionsResult;
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const withoutPermission = (
    permission: Parameters<PermissionsResult['withoutPermission']>[0]
  ) => permissions?.withoutPermission(permission) ?? false;

  return [
    {
      title: t('sidebar_tabs.forms'),
      href: `/${personalOrWsId}/forms`,
      icon: <ClipboardList className="h-4 w-4" />,
      matchExact: true,
      disabled:
        withoutPermission('manage_forms') &&
        withoutPermission('view_form_analytics'),
    },
    {
      title: t('forms.studio.create_form'),
      href: `/${personalOrWsId}/forms/new`,
      icon: <Plus className="h-4 w-4" />,
      disabled: withoutPermission('manage_forms'),
    },
    null,
    createWorkspaceMembersNavLink(t),
  ];
}
