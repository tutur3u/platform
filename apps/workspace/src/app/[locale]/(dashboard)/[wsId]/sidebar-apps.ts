import {
  getLaunchableApp,
  type LaunchableAppSlug,
  type LaunchableWorkspace,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { createTierRequirement } from '@/lib/feature-tiers';
import {
  createDashboardNavigationIcon,
  type DashboardNavigationLink,
} from './navigation-icon-descriptor';

/**
 * Apps listed in the root sidebar, one entry each. An entry opens the app at
 * the URL the app registry resolves (the apex path once an app is mounted,
 * its own origin before that). Each app owns its sub-navigation, so the
 * sidebar never lists an app's inner pages.
 */
export type SidebarAppSlug = Extract<
  LaunchableAppSlug,
  | 'ai'
  | 'calendar'
  | 'chat'
  | 'contacts'
  | 'documents'
  | 'drive'
  | 'finance'
  | 'forms'
  | 'hive'
  | 'inventory'
  | 'mail'
  | 'meet'
  | 'mind'
  | 'shortener'
  | 'tasks'
  | 'tools'
  | 'track'
>;

export type SidebarAppsInput = {
  ENABLE_AI_ONLY: boolean;
  /** Origin of the current request, so local dev resolves Portless hosts. */
  currentOrigin?: string;
  hasSecret: (name: string, value: string) => boolean;
  isMailUser: boolean;
  isPersonal: boolean;
  personalOrWsId: string;
  resolvedWorkspaceId: string;
  rootWorkspaceId: string;
  /** App names, translated by the caller so every key stays a literal there. */
  titles: Record<SidebarAppSlug, string>;
  /** Titles of the pages inside the Documents app. */
  documentsPageTitles: {
    notes: string;
    personalJournal: string;
    whiteboards: string;
  };
  withoutPermission: PermissionsResult['withoutPermission'];
};

export function createSidebarAppLinks(
  input: SidebarAppsInput
): DashboardNavigationLink[] {
  const {
    ENABLE_AI_ONLY,
    currentOrigin,
    hasSecret,
    isMailUser,
    isPersonal,
    personalOrWsId,
    resolvedWorkspaceId,
    rootWorkspaceId,
    titles,
    documentsPageTitles,
    withoutPermission,
  } = input;
  const workspace: LaunchableWorkspace = {
    id: resolvedWorkspaceId,
    personal: isPersonal,
  };
  const registryHref = (slug: string) => {
    const app = getLaunchableApp(slug);
    if (!app) throw new Error(`Unknown launchable app: ${slug}`);

    return resolveLaunchableAppUrl({ app, currentOrigin, workspace });
  };
  // Whiteboards is a page of Documents until the registry lists it as an app of
  // its own; from then on it is a top-level entry that opens where the registry
  // resolves it.
  const whiteboardsIsApp = Boolean(getLaunchableApp('whiteboards'));
  const whiteboardsTier = createTierRequirement('whiteboards', {
    alwaysShow: true,
  });
  const icon = (name: Parameters<typeof createDashboardNavigationIcon>[0]) =>
    createDashboardNavigationIcon(name, 'h-5 w-5');

  return [
    {
      id: 'tasks',
      appSlug: 'tasks',
      title: titles.tasks,
      href: registryHref('tasks'),
      icon: icon('CheckCircle2'),
      external: true,
      experimental: 'beta',
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
      preferencePlacement: 'root',
    },
    {
      id: 'calendar',
      appSlug: 'calendar',
      title: titles.calendar,
      href: registryHref('calendar'),
      icon: icon('Calendar'),
      external: true,
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
      preferencePlacement: 'root',
    },
    {
      id: 'time_tracker',
      appSlug: 'track',
      title: titles.track,
      href: registryHref('track'),
      icon: icon('ClockFading'),
      external: true,
      experimental: 'beta',
      disabled: ENABLE_AI_ONLY,
      requiredWorkspaceTier: createTierRequirement('time_tracker', {
        alwaysShow: true,
      }),
    },
    {
      id: 'forms',
      appSlug: 'forms',
      title: titles.forms,
      href: registryHref('forms'),
      icon: icon('ClipboardList'),
      external: true,
      disabled:
        withoutPermission('manage_forms') &&
        withoutPermission('view_form_analytics'),
    },
    {
      // Documents lives in the platform; its notes, journal and whiteboards are
      // part of the same app, so they sit one level down instead of at the root.
      id: 'documents',
      appSlug: 'documents',
      title: titles.documents,
      href: `/${personalOrWsId}/documents`,
      aliases: [
        `/${personalOrWsId}/documents/*`,
        `/${personalOrWsId}/notes/*`,
        `/${personalOrWsId}/personal-journal/*`,
        ...(whiteboardsIsApp ? [] : [`/${personalOrWsId}/whiteboards/*`]),
      ],
      icon: icon('FileText'),
      experimental: 'beta',
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_documents'),
      requiredWorkspaceTier: createTierRequirement('documents', {
        alwaysShow: true,
      }),
      children: [
        {
          title: titles.documents,
          href: `/${personalOrWsId}/documents`,
          icon: icon('FileText'),
        },
        {
          title: documentsPageTitles.notes,
          href: `/${personalOrWsId}/notes`,
          icon: icon('NotebookPen'),
        },
        {
          title: documentsPageTitles.personalJournal,
          href: `/${personalOrWsId}/personal-journal`,
          aliases: [`/${personalOrWsId}/personal-journal/*`],
          icon: icon('BookText'),
          disabled: !isPersonal,
        },
        ...(whiteboardsIsApp
          ? []
          : [
              {
                title: documentsPageTitles.whiteboards,
                href: `/${personalOrWsId}/whiteboards`,
                icon: icon('PencilRuler'),
                requiredWorkspaceTier: whiteboardsTier,
              },
            ]),
      ],
    },
    ...(whiteboardsIsApp
      ? [
          {
            id: 'whiteboards',
            appSlug: 'whiteboards',
            title: documentsPageTitles.whiteboards,
            href: registryHref('whiteboards'),
            icon: icon('PencilRuler'),
            external: true,
            requiredWorkspaceTier: whiteboardsTier,
          } satisfies DashboardNavigationLink,
        ]
      : []),
    {
      id: 'mail',
      appSlug: 'mail',
      title: titles.mail,
      href: registryHref('mail'),
      icon: icon('Mail'),
      external: true,
      experimental: 'beta',
      requireRootMember: true,
      disabled: !isMailUser,
    },
    {
      id: 'chat',
      appSlug: 'chat',
      title: titles.chat,
      href: registryHref('chat'),
      icon: icon('MessageCircleIcon'),
      external: true,
      experimental: 'beta',
      disabled: withoutPermission('view_chat'),
      requiredWorkspaceTier: createTierRequirement('chat', {
        alwaysShow: true,
      }),
    },
    {
      id: 'meet',
      appSlug: 'meet',
      title: titles.meet,
      href: registryHref('meet'),
      icon: icon('SquaresIntersect'),
      external: true,
    },
    {
      id: 'contacts',
      appSlug: 'contacts',
      title: titles.contacts,
      href: registryHref('contacts'),
      icon: icon('BookUser'),
      external: true,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_users_public_info'),
      preferencePlacement: 'root',
    },
    {
      id: 'finance',
      appSlug: 'finance',
      title: titles.finance,
      href: registryHref('finance'),
      icon: icon('BadgeDollarSign'),
      external: true,
      experimental: 'beta',
      disabled: ENABLE_AI_ONLY,
      preferencePlacement: 'root',
    },
    {
      id: 'inventory',
      appSlug: 'inventory',
      title: titles.inventory,
      href: registryHref('inventory'),
      icon: icon('Archive'),
      external: true,
      disabled: ENABLE_AI_ONLY || withoutPermission('view_inventory'),
      requiredWorkspaceTier: createTierRequirement('inventory', {
        alwaysShow: true,
      }),
    },
    {
      id: 'drive',
      appSlug: 'drive',
      title: titles.drive,
      href: registryHref('drive'),
      icon: icon('HardDrive'),
      external: true,
      experimental: 'beta',
      disabled: withoutPermission('manage_drive'),
      requiredWorkspaceTier: createTierRequirement('drive', {
        alwaysShow: true,
      }),
    },
    {
      id: 'mind',
      appSlug: 'mind',
      title: titles.mind,
      href: registryHref('mind'),
      icon: icon('BrainCircuit'),
      external: true,
    },
    {
      id: 'hive',
      appSlug: 'hive',
      title: titles.hive,
      href: registryHref('hive'),
      icon: icon('Blocks'),
      external: true,
    },
    {
      id: 'ai_lab',
      appSlug: 'ai',
      title: titles.ai,
      href: registryHref('ai'),
      icon: icon('Bot'),
      external: true,
      disabled: !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
      requiredWorkspaceTier: createTierRequirement('ai_lab', {
        alwaysShow: true,
      }),
    },
    {
      id: 'qr_generator',
      appSlug: 'tools',
      title: titles.tools,
      href: registryHref('tools'),
      icon: icon('QrCodeIcon'),
      external: true,
    },
    {
      // Workspace link management lives in the platform; the registry's
      // Shortener origin only executes redirects.
      id: 'link_shortener',
      appSlug: 'shortener',
      title: titles.shortener,
      href: `/${personalOrWsId}/link-shortener`,
      icon: icon('Link'),
      disabled:
        resolvedWorkspaceId !== rootWorkspaceId &&
        !hasSecret('ENABLE_LINK_SHORTENER', 'true'),
    },
  ];
}
