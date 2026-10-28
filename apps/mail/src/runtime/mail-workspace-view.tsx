import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { useTranslations } from 'next-intl';
import {
  getMailFolderHref,
  MAIL_FOLDERS,
  mailFolderIcons,
} from '../app/[locale]/(dashboard)/[wsId]/mail-folders';
import { MailSourceProvider } from '../app/[locale]/(dashboard)/[wsId]/mail-source';
import { MailWorkspace } from '../app/[locale]/(dashboard)/[wsId]/mail-workspace';
import { Structure } from '../app/[locale]/(dashboard)/[wsId]/structure';
import { MailActorProvider } from '../components/mail-actor-provider';
import type { loadMailWorkspace } from './mail-workspace-model.server';
import NotificationPopover from './notification-popover';

type Workspace = Extract<
  Awaited<ReturnType<typeof loadMailWorkspace>>,
  { kind: 'workspace' }
>;
export function MailWorkspaceView({
  workspace: model,
  locale,
}: {
  workspace: Workspace;
  locale: string;
}) {
  const t = useTranslations();
  const { actorId, profile, workspaceSlug, wsId } = model;
  const userPopover = (
    <UserNavClient user={profile} locale={locale} hideMetadata />
  );
  const notificationPopover = (
    <NotificationPopover
      userId={actorId}
      webAppUrl={model.notificationWebAppUrl}
    />
  );
  const links = MAIL_FOLDERS.map((folder) => {
    const Icon = mailFolderIcons[folder];
    return {
      href: getMailFolderHref(workspaceSlug, folder),
      icon: <Icon className="h-4 w-4" />,
      id: `mail.folder.${folder}`,
      matchExact: true,
      title: t(`mail.${folder}`),
    };
  });
  return (
    <MailSourceProvider connectedByDefault={model.connectedByDefault}>
      <SidebarProvider
        initialBehavior={model.behavior}
        initialBehaviorUpdatedAt={model.behaviorUpdatedAt}
      >
        <Structure
          actions={
            <div className="flex w-full items-center gap-1">
              <div className="flex-1">{userPopover}</div>
              {notificationPopover}
            </div>
          }
          defaultCollapsed={model.defaultCollapsed}
          links={links}
          personalOrWsId={workspaceSlug}
          notificationPopover={notificationPopover}
          userPopover={userPopover}
          workspace={model.workspace}
          wsId={wsId}
        >
          <RealtimeLogProvider wsId={wsId}>
            <div data-workspace-slug={workspaceSlug}>
              <MailActorProvider actorId={actorId}>
                <MailWorkspace workspaceId={workspaceSlug}>
                  {null}
                </MailWorkspace>
              </MailActorProvider>
            </div>
          </RealtimeLogProvider>
        </Structure>
      </SidebarProvider>
    </MailSourceProvider>
  );
}
