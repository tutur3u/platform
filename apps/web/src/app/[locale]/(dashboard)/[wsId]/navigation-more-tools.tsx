import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import type { getTranslations } from 'next-intl/server';
import { DEV_MODE } from '@/constants/env';
import { createTierRequirement } from '@/lib/feature-tiers';
import { getPasswordsAppOrigin } from '@/lib/passwords-app-url';
import {
  createDashboardNavigationIcon,
  type DashboardNavigationLink,
} from './navigation-icon-descriptor';

type MoreToolsInput = {
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  canAccessPasswords: boolean;
  personalOrWsId: string;
  resolvedWorkspaceId: string;
  ENABLE_AI_ONLY: boolean;
  hasSecret: (name: string, value: string) => boolean;
  withoutPermission: PermissionsResult['withoutPermission'];
  sidebarSections: {
    ai: string;
    core: string;
    operations: string;
    utilities: string;
    workTools: string;
  };
  isMailUser: boolean;
  isPersonal: boolean;
  chatAppHref: string;
  contactsAppHref: string;
  hiveAppHref: string;
  inventoryAppHref: string;
  mailAppHref: string;
  meetAppHref: string;
  mindAppHref: string;
  qrAppHref: string;
};

export function createMoreToolsNavigation({
  t,
  locale,
  canAccessPasswords,
  personalOrWsId,
  resolvedWorkspaceId,
  ENABLE_AI_ONLY,
  hasSecret,
  withoutPermission,
  sidebarSections,
  isMailUser,
  chatAppHref,
  contactsAppHref,
  hiveAppHref,
  inventoryAppHref,
  mailAppHref,
  meetAppHref,
  mindAppHref,
  qrAppHref,
  isPersonal,
}: MoreToolsInput): DashboardNavigationLink {
  return {
    id: 'more_tools',
    title: t('sidebar_tabs.more_tools'),
    icon: createDashboardNavigationIcon('SquareChevronRight', 'h-5 w-5'),
    children: [
      {
        id: 'passwords',
        title: t('passwords_vault.title'),
        href: `${getPasswordsAppOrigin()}/${locale}/${personalOrWsId}`,
        aliases: [
          `/${personalOrWsId}/passwords`,
          `/${personalOrWsId}/passwords/*`,
        ],
        icon: createDashboardNavigationIcon('Lock', 'h-5 w-5'),
        external: true,
        disabled: !canAccessPasswords || !process.env.PASSWORDS_APP_URL,
        preferenceSectionLabel: sidebarSections.workTools,
      },
      {
        id: 'personal_journal',
        title: t('personal_journal.title'),
        href: `/${personalOrWsId}/personal-journal`,
        aliases: [`/${personalOrWsId}/personal-journal/*`],
        icon: createDashboardNavigationIcon('NotebookPen', 'h-5 w-5'),
        disabled: !isPersonal,
        preferenceSectionLabel: sidebarSections.workTools,
      },
      {
        id: 'notes',
        title: t('sidebar_tabs.notes'),
        href: `/${personalOrWsId}/notes`,
        icon: createDashboardNavigationIcon('NotebookPen', 'h-5 w-5'),
        preferenceSectionLabel: sidebarSections.workTools,
      },
      {
        id: 'documents',
        title: t('sidebar_tabs.documents'),
        href: `/${personalOrWsId}/documents`,
        icon: createDashboardNavigationIcon('FileText', 'h-5 w-5'),
        disabled:
          ENABLE_AI_ONLY ||
          !hasSecret('ENABLE_DOCS', 'true') ||
          withoutPermission('manage_documents'),
        requiredWorkspaceTier: createTierRequirement('documents', {
          alwaysShow: true,
        }),
        experimental: 'beta',
        preferenceSectionLabel: sidebarSections.workTools,
      },
      {
        id: 'mind',
        title: t('sidebar_tabs.mind'),
        icon: createDashboardNavigationIcon('BrainCircuit', 'h-5 w-5'),
        href: mindAppHref,
        external: true,
        preferenceSectionLabel: sidebarSections.ai,
      },
      {
        id: 'hive',
        title: t('sidebar_tabs.hive'),
        icon: createDashboardNavigationIcon('Blocks', 'h-5 w-5'),
        href: hiveAppHref,
        external: true,
        preferenceSectionLabel: sidebarSections.ai,
      },
      {
        id: 'chat',
        title: t('sidebar_tabs.chat'),
        href: chatAppHref,
        icon: createDashboardNavigationIcon('MessageCircleIcon', 'h-5 w-5'),
        aliases: [`/${personalOrWsId}/chat`],
        external: true,
        disabled: withoutPermission('view_chat'),
        requiredWorkspaceTier: createTierRequirement('chat', {
          alwaysShow: true,
        }),
        experimental: 'beta',
        preferenceSectionLabel: sidebarSections.ai,
      },
      {
        id: 'qr_generator',
        title: t('sidebar_tabs.qr_generator'),
        href: qrAppHref,
        icon: createDashboardNavigationIcon('QrCodeIcon', 'h-5 w-5'),
        aliases: [`/${personalOrWsId}/qr-generator`],
        external: true,
        preferenceSectionLabel: sidebarSections.utilities,
      },
      null,
      {
        id: 'workforce',
        title: t('sidebar_tabs.workforce'),
        href: `${contactsAppHref}/workforce`,
        external: true,
        icon: createDashboardNavigationIcon('BriefcaseBusiness', 'h-5 w-5'),
        requiredWorkspaceTier: createTierRequirement('workforce', {
          alwaysShow: true,
        }),
        children: [
          {
            title: t('workspace-workforce-tabs.directory'),
            href: `${contactsAppHref}/workforce`,
            icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
            matchExact: true,
            disabled:
              withoutPermission('view_workforce') &&
              withoutPermission('manage_workforce'),
          },
          {
            title: t('workspace-workforce-tabs.contracts'),
            href: `${contactsAppHref}/workforce/contracts`,
            icon: createDashboardNavigationIcon('ScrollText', 'h-5 w-5'),
            disabled: withoutPermission('manage_workforce'),
          },
          null,
          {
            title: t('workspace-workforce-tabs.payroll'),
            href: `${contactsAppHref}/workforce/payroll`,
            icon: createDashboardNavigationIcon('HandCoins', 'h-5 w-5'),
            disabled:
              withoutPermission('view_payroll') &&
              withoutPermission('manage_payroll'),
          },
        ],
        aliases: [
          `/${personalOrWsId}/workforce`,
          `/${personalOrWsId}/workforce/contracts`,
          `/${personalOrWsId}/workforce/payroll`,
        ],
        tempDisabled: true, // coming soon
        preferenceSectionLabel: sidebarSections.operations,
      },
      {
        id: 'posts',
        title: t('workspace-users-tabs.reports'),
        href: `${contactsAppHref}/reports`,
        icon: createDashboardNavigationIcon('ClipboardList', 'h-5 w-5'),
        disabled:
          (!DEV_MODE && ENABLE_AI_ONLY) ||
          (withoutPermission('view_user_groups_posts') &&
            withoutPermission('approve_posts') &&
            withoutPermission('view_user_groups_reports') &&
            withoutPermission('approve_reports')),
        external: true,
        preferenceSectionLabel: sidebarSections.operations,
      },
      {
        id: 'inventory',
        title: t('sidebar_tabs.inventory'),
        icon: createDashboardNavigationIcon('Archive', 'h-5 w-5'),
        href: inventoryAppHref,
        external: true,
        requiredWorkspaceTier: createTierRequirement('inventory', {
          alwaysShow: true,
        }),
        disabled: ENABLE_AI_ONLY || withoutPermission('view_inventory'),
        preferenceSectionLabel: sidebarSections.operations,
      },
      null,
      // AI Lab, Google Workspace, and utility tools
      {
        id: 'ai_lab',
        title: t('sidebar_tabs.ai_lab'),
        icon: createDashboardNavigationIcon('Box', 'h-5 w-5'),
        requiredWorkspaceTier: createTierRequirement('ai_lab', {
          alwaysShow: true,
        }),
        children: [
          {
            title: t('sidebar_tabs.spark'),
            href: `/${personalOrWsId}/ai/spark`,
            icon: createDashboardNavigationIcon('Sparkles', 'h-5 w-5'),
            disabled:
              ENABLE_AI_ONLY ||
              !hasSecret('ENABLE_TASKS', 'true') ||
              withoutPermission('manage_projects'),
            experimental: 'alpha',
          },
          {
            title: t('sidebar_tabs.chat_with_ai'),
            href: `/${personalOrWsId}/ai-chat`,
            icon: createDashboardNavigationIcon('MessageCircleIcon', 'h-5 w-5'),
            disabled:
              ENABLE_AI_ONLY ||
              !hasSecret('ENABLE_CHAT', 'true') ||
              withoutPermission('ai_chat'),
            experimental: 'beta',
          },
          {
            title: t('sidebar_tabs.memories'),
            href: `/${personalOrWsId}/memories`,
            icon: createDashboardNavigationIcon('BrainCircuit', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'beta',
          },
          {
            title: t('sidebar_tabs.ai_executions'),
            href: `/${personalOrWsId}/ai/executions`,
            icon: createDashboardNavigationIcon('Cctv', 'h-5 w-5'),
            requireRootWorkspace: true,
            requireRootMember: true,
            disabled: withoutPermission('manage_workspace_roles'),
          },
          {
            title: t('sidebar_tabs.models'),
            href: `/${personalOrWsId}/models`,
            icon: createDashboardNavigationIcon('Box', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'alpha',
          },
          {
            title: t('sidebar_tabs.datasets'),
            href: `/${personalOrWsId}/datasets`,
            icon: createDashboardNavigationIcon('Database', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'beta',
          },
          {
            title: t('sidebar_tabs.pipelines'),
            href: `/${personalOrWsId}/pipelines`,
            icon: createDashboardNavigationIcon('Play', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'alpha',
          },
          {
            title: t('sidebar_tabs.crawlers'),
            href: `/${personalOrWsId}/crawlers`,
            icon: createDashboardNavigationIcon('ScanSearch', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'alpha',
          },
          {
            title: t('sidebar_tabs.cron'),
            href: `/${personalOrWsId}/cron`,
            icon: createDashboardNavigationIcon('Clock', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'alpha',
          },
          {
            title: t('sidebar_tabs.queues'),
            href: `/${personalOrWsId}/queues`,
            icon: createDashboardNavigationIcon('Logs', 'h-5 w-5'),
            disabled:
              !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
            experimental: 'alpha',
          },
        ],
        preferenceSectionLabel: sidebarSections.ai,
      },
      {
        id: 'google_workspace',
        title: t('sidebar_tabs.google_workspace'),
        icon: createDashboardNavigationIcon('ScreenShare', 'h-5 w-5'),
        requireRootWorkspace: true,
        requireRootMember: true,
        children: [
          {
            title: t('sidebar_tabs.drive'),
            icon: createDashboardNavigationIcon('HardDrive', 'h-5 w-5'),
            href: 'https://drive.google.com/a/tuturuuu.com',
            external: true,
            newTab: true,
            requireRootWorkspace: true,
            requireRootMember: true,
          },
          {
            title: t('sidebar_tabs.mail'),
            icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
            href: 'https://mail.google.com/a/tuturuuu.com',
            external: true,
            newTab: true,
            requireRootWorkspace: true,
            requireRootMember: true,
          },
          {
            title: t('sidebar_tabs.calendar'),
            icon: createDashboardNavigationIcon('Calendar', 'h-5 w-5'),
            href: 'https://www.google.com/calendar/hosted/tuturuuu.com',
            external: true,
            newTab: true,
            requireRootWorkspace: true,
            requireRootMember: true,
          },
          // {
          //   title: t('sidebar_tabs.groups'),
          //   icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
          //   href: 'https://groups.google.com/a/tuturuuu.com',
          //   external: true,
          //   newTab: true,
          //   requireRootWorkspace: true,
          //   requireRootMember: true,
          // },
          // {
          //   title: t('sidebar_tabs.sites'),
          //   icon: createDashboardNavigationIcon('PanelsTopLeft', 'h-5 w-5'),
          //   href: 'https://sites.google.com/a/tuturuuu.com',
          //   external: true,
          //   newTab: true,
          //   requireRootWorkspace: true,
          //   requireRootMember: true,
          // },
        ],
        preferenceSectionLabel: sidebarSections.utilities,
      },
      {
        id: 'meet',
        title: t('sidebar_tabs.meet'),
        href: meetAppHref,
        icon: createDashboardNavigationIcon('SquaresIntersect', 'h-5 w-5'),
        preferenceSectionLabel: sidebarSections.utilities,
        external: true,
        children: [
          {
            title: t('sidebar_tabs.plans'),
            href: `${meetAppHref}/plans`,
            icon: createDashboardNavigationIcon('VectorSquare', 'h-5 w-5'),
          },
          {
            title: t('sidebar_tabs.meetings'),
            href: `${meetAppHref}/meetings`,
            icon: createDashboardNavigationIcon('SquareUserRound', 'h-5 w-5'),
            requireRootWorkspace: true,
            requireRootMember: true,
          },
        ],
      },
      {
        id: 'polls',
        title: t('sidebar_tabs.polls'),
        href: `/${personalOrWsId}/polls`,
        icon: createDashboardNavigationIcon('Vote', 'h-5 w-5'),
        disabled: !DEV_MODE,
        requireRootWorkspace: true,
        requireRootMember: true,
        preferenceSectionLabel: sidebarSections.utilities,
      },
      {
        id: 'mail',
        title: t('sidebar_tabs.mail'),
        href: mailAppHref,
        icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
        external: true,
        requireRootMember: true,
        disabled: !isMailUser,
        experimental: 'beta',
        preferenceSectionLabel: sidebarSections.utilities,
        children: [
          {
            title: t('mail.inbox'),
            href: mailAppHref,
            icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
          {
            title: t('mail.starred'),
            href: `${mailAppHref}?folder=starred`,
            icon: createDashboardNavigationIcon('Star', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
          {
            title: t('mail.sent'),
            href: `${mailAppHref}?folder=sent`,
            icon: createDashboardNavigationIcon('Send', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
          {
            title: t('mail.drafts'),
            href: `${mailAppHref}?folder=drafts`,
            icon: createDashboardNavigationIcon('TextSelect', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
          {
            title: t('mail.spam'),
            href: `${mailAppHref}?folder=spam`,
            icon: createDashboardNavigationIcon('TriangleAlert', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
          {
            title: t('mail.trash'),
            href: `${mailAppHref}?folder=trash`,
            icon: createDashboardNavigationIcon('Trash', 'h-5 w-5'),
            external: true,
            disabled: !isMailUser,
          },
        ],
      },
      {
        id: 'link_shortener',
        title: t('sidebar_tabs.link_shortener'),
        href: `/${personalOrWsId}/link-shortener`,
        icon: createDashboardNavigationIcon('Link', 'h-5 w-5'),
        disabled:
          resolvedWorkspaceId !== ROOT_WORKSPACE_ID &&
          !hasSecret('ENABLE_LINK_SHORTENER', 'true'),
        preferenceSectionLabel: sidebarSections.utilities,
      },
    ],
  };
}
