import {
  Bell,
  Bookmark,
  Box,
  Brain,
  CheckSquare,
  ClipboardList,
  Compass,
  FileText,
  Goal,
  KanbanSquare,
  Keyboard,
  Laptop,
  Paintbrush,
  Share2,
  Shield,
  Sparkles,
  Tags,
  User,
  Users,
} from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildCoreSettingsNavGroups({
  availability,
  boardId,
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [
    {
      label: t('settings.user.title'),
      items: [
        {
          name: 'profile',
          label: t('settings.user.profile'),
          icon: User,
          description: t('settings.user.profile_description'),
          keywords: ['Profile'],
        },
        {
          name: 'security',
          label: t('ws-settings.security'),
          icon: Shield,
          description: t('settings-account.security-description'),
          keywords: ['Security'],
        },
        {
          name: 'sessions',
          label: t('settings.user.sessions'),
          icon: Laptop,
          description: t('settings.user.sessions_description'),
          keywords: ['Sessions', 'Devices'],
        },
        {
          name: 'accounts',
          label: t('settings-nav.accounts.name'),
          icon: Users,
          description: t('settings-nav.accounts.description'),
          keywords: ['Accounts'],
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          name: 'appearance',
          label: t('settings.preferences.appearance'),
          icon: Paintbrush,
          description: wsId
            ? t('settings.preferences.appearance_ws_description')
            : t('settings-account.appearance-description'),
          keywords: ['Appearance', 'Theme'],
        },
        {
          name: 'notifications',
          label: t('settings.preferences.notifications'),
          icon: Bell,
          description: wsId
            ? t('settings.preferences.notifications_ws_description')
            : 'Manage your notification preferences',
          keywords: ['Notifications'],
        },
        {
          name: 'navigation',
          label: t('settings.preferences.navigation.menu_label'),
          icon: Compass,
          description: t('settings.preferences.navigation.menu_description'),
          keywords: [
            'Navigation',
            'Sidebar',
            'Start page',
            'Workspace',
            'Redirect',
            'Menu',
          ],
        },
        {
          name: 'forms',
          label: t('settings.preferences.forms'),
          icon: FileText,
          description: t('settings.preferences.forms_description'),
          keywords: ['Forms', 'Auto-save', 'Form builder'],
        },
        {
          name: 'keyboard_shortcuts',
          label: t('settings.preferences.keyboard_shortcuts'),
          icon: Keyboard,
          description: t('settings.preferences.keyboard_shortcuts_description'),
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
        },
      ],
    },
    {
      label: t('settings.tasks.title'),
      items: [
        ...(wsId && boardId
          ? [
              {
                name: 'task_board',
                label: t('settings.tasks.board'),
                icon: KanbanSquare,
                description: t('settings.tasks.board_description'),
                keywords: ['Tasks', 'Board', 'Layout', 'Estimates', 'Logs'],
              },
            ]
          : []),
        {
          name: 'tasks_general',
          label: t('settings.tasks.general'),
          icon: CheckSquare,
          description: t('settings.tasks.general_description'),
          keywords: ['Tasks', 'General', 'Review', 'Due date'],
        },
        {
          name: 'task_share',
          label: t('settings.tasks.share'),
          icon: Share2,
          description: t('settings.tasks.share_description'),
          keywords: ['Tasks', 'Share', 'Guests', 'Access'],
        },
        ...(wsId
          ? [
              {
                name: 'task_labels',
                label: t('settings.tasks.labels'),
                icon: Tags,
                description: t('settings.tasks.labels_description'),
                keywords: ['Tasks', 'Labels', 'Tags'],
              },
              {
                name: 'task_projects',
                label: t('settings.tasks.projects'),
                icon: Box,
                description: t('settings.tasks.projects_description'),
                keywords: ['Tasks', 'Projects'],
              },
              {
                name: 'task_initiatives',
                label: t('settings.tasks.initiatives'),
                icon: Goal,
                description: t('settings.tasks.initiatives_description'),
                keywords: ['Tasks', 'Initiatives'],
              },
              {
                name: 'task_templates',
                label: t('settings.tasks.templates'),
                icon: Bookmark,
                description: t('settings.tasks.templates_description'),
                keywords: ['Tasks', 'Templates'],
              },
            ]
          : []),
      ],
    },
    {
      label: t('settings.mira.title'),
      items: [
        {
          name: 'mira_personality',
          label: t('settings.mira.personality'),
          icon: Sparkles,
          description: t('settings.mira.personality_description'),
          keywords: ['Mira', 'AI', 'Personality', 'Soul', 'Assistant'],
        },
        {
          name: 'mira_memories',
          label: t('settings.mira.memories'),
          icon: Brain,
          description: t('settings.mira.memories_description'),
          keywords: ['Mira', 'Memory', 'Remember', 'Facts'],
        },
      ],
    },
  ];

  if (!wsId) return groups;

  groups.push({
    label: t('settings.user_management.title'),
    items: [
      {
        name: 'approvals',
        label: t('settings.approvals.title'),
        icon: ClipboardList,
        description: t('settings.approvals.description'),
        keywords: ['Approvals', 'Posts', 'Reports'],
      },
    ],
  });

  if (availability.canAccessReports) {
    groups.push({
      label: t('settings.reports.title'),
      items: [
        {
          name: 'workspace_reports',
          label: t('workspace-settings-layout.reports'),
          icon: FileText,
          keywords: [
            'Reports',
            'Templates',
            'Report settings',
            'Lead generation',
          ],
        },
        {
          name: 'report_default_title',
          label: t('settings.reports.default_title'),
          icon: FileText,
          description: t('settings.reports.default_title_description'),
          keywords: ['Reports', 'Templates', 'Title', 'Default'],
        },
      ],
    });
  }

  return groups;
}
