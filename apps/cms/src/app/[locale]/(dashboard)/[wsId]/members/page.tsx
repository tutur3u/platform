import { Badge } from '@tuturuuu/ui/badge';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CmsMembersSection } from '@/features/settings/cms-members-section';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsMembersPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations();
  const tSettings = await getTranslations('external-projects.settings');
  const canManageMembers =
    access.isRootAdmin ||
    Boolean(
      access.workspacePermissions?.containsPermission(
        'manage_workspace_members'
      )
    );
  const canManageRoles =
    access.isRootAdmin ||
    Boolean(
      access.workspacePermissions?.containsPermission('manage_workspace_roles')
    );

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.06),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-sm">
        <div className="space-y-3 p-6 lg:p-8">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {t('common.members')}
          </Badge>
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-tight">
              {tSettings('members_title')}
            </h1>
            <p className="max-w-3xl text-muted-foreground text-sm leading-6">
              {tSettings('members_description')}
            </p>
          </div>
        </div>
      </section>

      <CmsMembersSection
        canManageMembers={canManageMembers}
        canManageRoles={canManageRoles}
        workspaceId={access.normalizedWorkspaceId}
      />
    </div>
  );
}
