'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  Box,
  Brain,
  CalendarDays,
  CheckSquare,
  FileEdit,
  hexagons3,
  Icon,
  KanbanSquare,
  Keyboard,
  Logs,
  NotepadText,
  Paintbrush,
  PanelLeft,
  Repeat,
  Share2,
  Sparkle,
  Tags,
  User,
} from '@tuturuuu/icons';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteWorkspaceSettingsPanel,
  SettingsWorkspaceBreadcrumb,
} from '@tuturuuu/satellite/workspace-settings';
import { TaskSettings } from '@tuturuuu/tasks-ui/settings/task-settings';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import { KeyboardShortcutsSettings } from '@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings';
import { LunarCalendarSettings } from '@tuturuuu/ui/custom/settings/lunar-calendar-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import { TaskIntelligenceSettingsPanel } from './task-intelligence-settings-panel';
import {
  TaskBoardSettingsPanel,
  TaskDraftsSettings,
  TaskEstimatesSettings,
  TaskHabitsSettings,
  TaskInitiativesSettings,
  TaskLabelsSettings,
  TaskLogsSettings,
  TaskNotesSettings,
  TaskProjectsSettings,
  TaskShareSettingsPanel,
  TaskTemplatesSettings,
} from './task-settings-panels';

interface SettingsDialogProps {
  boardId?: string;
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
  workspace?: Workspace | null;
}

function EstimateIcon({ className }: { className?: string }) {
  return <Icon iconNode={hexagons3} className={className} />;
}

function normalizeSettingsTab(tab: string) {
  return tab === 'sidebar' ? 'sidebar' : tab;
}

export function SettingsDialog({
  boardId,
  wsId,
  user,
  defaultTab = 'tasks_general',
  workspace: workspaceProp,
}: SettingsDialogProps) {
  const t = useTranslations();
  const normalizedDefaultTab = normalizeSettingsTab(defaultTab);
  const [activeTab, setActiveTab] = useState(normalizedDefaultTab);

  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  const { data: fetchedWorkspace } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID');
      return getWorkspace(wsId);
    },
    enabled: !workspaceProp && !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const workspace = workspaceProp ?? fetchedWorkspace ?? null;
  const tasksLabel = t('settings.tasks.title');

  useEffect(() => {
    setActiveTab(normalizedDefaultTab);
  }, [normalizedDefaultTab]);

  const navItems = useMemo(
    () => [
      {
        label: tasksLabel,
        items: [
          {
            name: 'tasks_general',
            label: t('settings.tasks.general'),
            icon: CheckSquare,
            description: t('settings.tasks.general_description'),
            keywords: ['Tasks', 'General'],
          },
          {
            name: 'task_board',
            label: t('settings.tasks.board'),
            icon: KanbanSquare,
            description: t('settings.tasks.board_description'),
            keywords: ['Tasks', 'Board', 'Layout'],
          },
          {
            name: 'task_intelligence',
            label: t('settings.tasks.intelligence.title'),
            icon: Brain,
            description: t('settings.tasks.intelligence.description'),
            keywords: ['Tasks', 'AI', 'Insights', 'Analytics', 'Goals'],
          },
          {
            name: 'task_share',
            label: t('settings.tasks.share'),
            icon: Share2,
            description: t('settings.tasks.share_description'),
            keywords: ['Tasks', 'Share', 'Guests'],
          },
          {
            name: 'task_projects',
            label: t('settings.tasks.projects'),
            icon: Box,
            description: t('settings.tasks.projects_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Projects'],
          },
          {
            name: 'task_labels',
            label: t('settings.tasks.labels'),
            icon: Tags,
            description: t('settings.tasks.labels_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Labels', 'Tags'],
          },
          {
            name: 'task_templates',
            label: t('settings.tasks.templates'),
            icon: Bookmark,
            description: t('settings.tasks.templates_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Templates'],
          },
          {
            name: 'task_initiatives',
            label: t('settings.tasks.initiatives'),
            icon: Sparkle,
            description: t('settings.tasks.initiatives_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Initiatives'],
          },
        ],
      },
      {
        label: t('settings.tasks.operations'),
        items: [
          {
            name: 'task_estimates',
            label: t('settings.tasks.estimates'),
            icon: EstimateIcon,
            description: t('settings.tasks.estimates_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Estimates'],
          },
          {
            name: 'task_logs',
            label: t('settings.tasks.logs'),
            icon: Logs,
            description: t('settings.tasks.logs_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Logs', 'History'],
          },
          {
            name: 'task_habits',
            label: t('settings.tasks.habits'),
            icon: Repeat,
            description: t('settings.tasks.habits_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Habits'],
          },
          {
            name: 'task_notes',
            label: t('settings.tasks.notes'),
            icon: NotepadText,
            description: t('settings.tasks.notes_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Notes'],
          },
          {
            name: 'task_drafts',
            label: t('settings.tasks.drafts'),
            icon: FileEdit,
            description: t('settings.tasks.drafts_description'),
            hideContentHeader: true,
            keywords: ['Tasks', 'Drafts'],
          },
        ],
      },
      {
        label: t('settings.calendar.title'),
        items: [
          {
            name: 'calendar_general',
            label: t('settings.calendar.general'),
            icon: CalendarDays,
            description: t('settings.calendar.general_description'),
            keywords: ['Calendar', 'General', 'Lunar'],
          },
        ],
      },
      ...(wsId ? [createWorkspaceSettingsNavGroup(t)] : []),
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
        ],
      },
      {
        label: t('settings.preferences.title'),
        items: [
          {
            name: 'appearance',
            label: t('settings.preferences.appearance'),
            icon: Paintbrush,
            description: t('settings-account.appearance-description'),
            keywords: ['Appearance', 'Theme'],
          },
          {
            name: 'sidebar',
            label: t('settings.preferences.sidebar'),
            icon: PanelLeft,
            description: t('settings.preferences.sidebar_description'),
            keywords: ['Sidebar', 'Navigation', 'Menu'],
          },
          {
            name: 'keyboard_shortcuts',
            label: t('settings.preferences.keyboard_shortcuts'),
            icon: Keyboard,
            description: t(
              'settings.preferences.keyboard_shortcuts_description'
            ),
            keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
          },
        ],
      },
    ],
    [t, tasksLabel, wsId]
  );

  return (
    <SettingsDialogShell
      activeGroupBreadcrumb={
        wsId && activeTab.startsWith('workspace_') ? (
          <SettingsWorkspaceBreadcrumb activeTab={activeTab} wsId={wsId} />
        ) : undefined
      }
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[tasksLabel]}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        workspace={workspace}
        wsId={wsId}
      />
      {activeTab === 'calendar_general' && (
        <div className="h-full">
          <LunarCalendarSettings />
        </div>
      )}

      {activeTab === 'tasks_general' && (
        <div className="h-full">
          <TaskSettings workspace={workspace} />
        </div>
      )}

      {activeTab === 'task_board' && (
        <TaskBoardSettingsPanel boardId={boardId} wsId={wsId} />
      )}

      {activeTab === 'task_intelligence' && wsId && (
        <TaskIntelligenceSettingsPanel wsId={wsId} />
      )}

      {activeTab === 'task_share' && (
        <TaskShareSettingsPanel boardId={boardId} wsId={wsId} />
      )}

      {activeTab === 'task_projects' && wsId && (
        <TaskProjectsSettings
          currentUserId={user?.id}
          workspace={workspace}
          wsId={wsId}
        />
      )}

      {activeTab === 'task_labels' && wsId && (
        <TaskLabelsSettings wsId={wsId} />
      )}

      {activeTab === 'task_templates' && wsId && (
        <TaskTemplatesSettings wsId={wsId} />
      )}

      {activeTab === 'task_initiatives' && wsId && (
        <TaskInitiativesSettings wsId={wsId} />
      )}

      {activeTab === 'task_estimates' && wsId && (
        <TaskEstimatesSettings wsId={wsId} />
      )}

      {activeTab === 'task_logs' && wsId && <TaskLogsSettings wsId={wsId} />}

      {activeTab === 'task_habits' && wsId && (
        <TaskHabitsSettings wsId={wsId} />
      )}

      {activeTab === 'task_notes' && wsId && <TaskNotesSettings wsId={wsId} />}

      {activeTab === 'task_drafts' && wsId && (
        <TaskDraftsSettings wsId={wsId} />
      )}

      {activeTab === 'profile' && user && (
        <div className="space-y-8">
          <div className="grid gap-6">
            <SettingItemTab
              title={t('settings-account.display-name')}
              description={t('settings-account.display-name-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.display_name || t('common.unnamed')}
              </span>
            </SettingItemTab>
            <SettingItemTab
              title="Email"
              description={t('settings-account.email-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.email || '—'}
              </span>
            </SettingItemTab>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="h-full">
          <AppearanceSettings
            canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
          />
        </div>
      )}

      {activeTab === 'sidebar' && (
        <div className="h-full">
          <SharedSidebarSettings useSidebar={useSidebar} />
        </div>
      )}

      {activeTab === 'keyboard_shortcuts' && (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      )}
    </SettingsDialogShell>
  );
}
