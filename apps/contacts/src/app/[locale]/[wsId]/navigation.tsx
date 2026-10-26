import {
  BookOpenCheck,
  BookUser,
  Calendar,
  ChartColumn,
  CheckCircle2,
  ClipboardList,
  IdCardLanyard,
  LayoutDashboard,
  MailCheck,
  Mails,
  Megaphone,
  MessageCircle,
  Send,
  Tags,
  Upload,
  UserCheck,
  Users,
} from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

/**
 * Navigation for the Contacts satellite (contacts.tuturuuu.com). Ported from
 * the `id:'users'` block of apps/web's dashboard navigation, flattened to
 * top-level items (this whole app is the users/CRM surface). Feature URLs are
 * kept identical to web (`/{wsId}/users/...`) so the ported pages and API
 * routes stay 1:1. Icons are plain JSX (satellites don't use web's icon
 * descriptor serialization) and permission gates use the shared
 * PermissionsResult.
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
      title: t('workspace-users-tabs.overview'),
      href: `/${personalOrWsId}/users`,
      icon: <LayoutDashboard className="h-4 w-4" />,
      matchExact: true,
      disabled: withoutPermission('manage_users'),
    },
    null,
    {
      title: t('workspace-users-tabs.database'),
      href: `/${personalOrWsId}/users/database`,
      icon: <BookUser className="h-4 w-4" />,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_users_private_info') &&
        withoutPermission('view_users_public_info'),
    },
    {
      title: t('workspace-users-tabs.attendance'),
      href: `/${personalOrWsId}/users/attendance`,
      icon: <UserCheck className="h-4 w-4" />,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('check_user_attendance'),
    },
    {
      title: t('workspace-users-tabs.groups'),
      href: `/${personalOrWsId}/users/groups`,
      icon: <Users className="h-4 w-4" />,
      matchExact: true,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_user_groups'),
    },
    {
      title: t('workspace-users-tabs.group_calendar'),
      href: `/${personalOrWsId}/users/groups/calendar`,
      icon: <Calendar className="h-4 w-4" />,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_user_groups'),
    },
    {
      title: t('workspace-users-tabs.group_tags'),
      href: `/${personalOrWsId}/users/group-tags`,
      icon: <Tags className="h-4 w-4" />,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_user_groups'),
    },
    {
      title: t('workspace-users-tabs.metrics'),
      href: `/${personalOrWsId}/users/groups/indicators`,
      icon: <ChartColumn className="h-4 w-4" />,
      disabled: withoutPermission('view_user_groups_scores'),
    },
    {
      title: t('workspace-users-tabs.feedbacks'),
      href: `/${personalOrWsId}/users/feedbacks`,
      icon: <MessageCircle className="h-4 w-4" />,
      disabled: withoutPermission('view_user_groups'),
    },
    {
      title: t('workspace-users-tabs.tutoring'),
      href: `/${personalOrWsId}/users/tutoring`,
      icon: <BookUser className="h-4 w-4" />,
      disabled: withoutPermission('view_user_groups'),
    },
    null,
    {
      title: t('workspace-users-tabs.reports'),
      href: `/${personalOrWsId}/reports`,
      aliases: [`/${personalOrWsId}/posts`, `/${personalOrWsId}/users/reports`],
      icon: <ClipboardList className="h-4 w-4" />,
      disabled:
        withoutPermission('view_user_groups_reports') &&
        withoutPermission('view_user_groups_posts') &&
        withoutPermission('approve_reports') &&
        withoutPermission('approve_posts'),
    },
    {
      title: t('workspace-users-tabs.approvals'),
      href: `/${personalOrWsId}/users/approvals`,
      icon: <CheckCircle2 className="h-4 w-4" />,
      disabled:
        withoutPermission('approve_reports') &&
        withoutPermission('approve_posts'),
    },
    {
      title: t('workspace-users-tabs.guest_leads'),
      href: `/${personalOrWsId}/users/guest-leads`,
      icon: <Mails className="h-4 w-4" />,
      disabled: withoutPermission('create_lead_generations'),
    },
    null,
    {
      title: t('workspace-users-tabs.topic_announcements'),
      href: `/${personalOrWsId}/users/topic-announcements`,
      aliases: [
        `/${personalOrWsId}/users/topic-announcements`,
        `/${personalOrWsId}/users/topic-announcements/announcements`,
        `/${personalOrWsId}/users/topic-announcements/contacts`,
        `/${personalOrWsId}/users/topic-announcements/delivery`,
        `/${personalOrWsId}/users/topic-announcements/import`,
        `/${personalOrWsId}/users/topic-announcements/templates`,
      ],
      icon: <Megaphone className="h-4 w-4" />,
      disabled: withoutPermission('manage_users'),
      experimental: 'beta',
      children: [
        {
          title: t('ws-topic-announcements.nav_announcements'),
          href: `/${personalOrWsId}/users/topic-announcements/announcements`,
          icon: <Megaphone className="h-4 w-4" />,
          sectionLabel: t('ws-topic-announcements.nav_group_send'),
        },
        {
          title: t('ws-topic-announcements.nav_delivery'),
          href: `/${personalOrWsId}/users/topic-announcements/delivery`,
          icon: <Send className="h-4 w-4" />,
        },
        null,
        {
          title: t('ws-topic-announcements.nav_contacts'),
          href: `/${personalOrWsId}/users/topic-announcements/contacts`,
          icon: <MailCheck className="h-4 w-4" />,
          sectionLabel: t('ws-topic-announcements.nav_group_setup'),
        },
        {
          title: t('ws-topic-announcements.nav_templates'),
          href: `/${personalOrWsId}/users/topic-announcements/templates`,
          icon: <BookOpenCheck className="h-4 w-4" />,
        },
        {
          title: t('ws-topic-announcements.nav_import'),
          href: `/${personalOrWsId}/users/topic-announcements/import`,
          icon: <Upload className="h-4 w-4" />,
        },
      ],
    },
    null,
    {
      title: t('sidebar_tabs.structure'),
      href: `/${personalOrWsId}/users/structure`,
      aliases: [`/${personalOrWsId}/users/structure`],
      icon: <IdCardLanyard className="h-4 w-4" />,
      requireRootWorkspace: true,
      requireRootMember: true,
      disabled: withoutPermission('manage_users'),
    },
    null,
    createWorkspaceMembersNavLink(t),
  ];
}
