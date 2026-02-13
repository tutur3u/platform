import {
  Activity,
  Brain,
  Calendar,
  HardDrive,
  Key,
  Library,
  Plug,
  Receipt,
  Repeat,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import {
  AICronJobsStats,
  AIDatasetsStats,
  AIExecutionsStats,
  AIPromptsStats,
  APIKeysStats,
  CalendarConnectionsStats,
  CalendarEventsStats,
  ChatUsageStats,
  CoursesStats,
  CrawlersUsageStats,
  DiscordIntegrationsStats,
  DocumentsUsageStats,
  DriveUsageStats,
  FinanceUsageStats,
  FlashcardsStats,
  HabitsUsageStats,
  InventoryUsageStats,
  InvoicesUsageStats,
  LinksUsageStats,
  ModelsUsageStats,
  PostsUsageStats,
  QuizzesStats,
  SecretsStats,
  SentEmailsStats,
  TaskBoardsStats,
  TaskProjectsStats,
  TasksUsageStats,
  TimeTrackingUsageStats,
  UsageSection,
  WorkspaceAgeStats,
  WorkspaceGroupsStats,
  WorkspaceMembersStats,
  WorkspaceRolesStats,
} from './_components';

interface UsageContentProps {
  wsId: string;
}

export default async function UsageContent({ wsId }: UsageContentProps) {
  const t = await getTranslations();
  const workspace = await getWorkspace(wsId);
  if (!workspace) notFound();

  const isRootWorkspace = workspace.id === ROOT_WORKSPACE_ID;

  return (
    <div className="space-y-6">
      <FeatureSummary
        title={t('sidebar_tabs.usage')}
        description="Monitor workspace activity, feature usage, and system metrics across your organization"
      />

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          All Systems Operational
        </Badge>
        {isRootWorkspace && (
          <Badge
            variant="secondary"
            className="gap-1.5 bg-primary/10 px-3 py-1.5 text-primary"
          >
            Root Workspace
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        <UsageSection
          icon={<Users className="h-5 w-5" />}
          title="Workspace Overview"
          description="Team members, roles, and workspace information"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceMembersStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceRolesStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceGroupsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceAgeStats wsId={workspace.id} workspace={workspace} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<HardDrive className="h-5 w-5" />}
          title="Content & Storage"
          description="Documents, files, and storage usage"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <DriveUsageStats
              wsId={workspace.id}
              isRootWorkspace={isRootWorkspace}
            />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <DocumentsUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <PostsUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <LinksUsageStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Receipt className="h-5 w-5" />}
          title="Finance"
          description="Financial transactions, invoices, and inventory"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <FinanceUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <InvoicesUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <InventoryUsageStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Activity className="h-5 w-5" />}
          title="Tasks & Projects"
          description="Boards, projects, and task management"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <TaskBoardsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <TaskProjectsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <TasksUsageStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Repeat className="h-5 w-5" />}
          title="Time & Habits"
          description="Time tracking sessions and habit management"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <TimeTrackingUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <HabitsUsageStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Calendar className="h-5 w-5" />}
          title="Calendar"
          description="Events and calendar integrations"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <CalendarEventsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <CalendarConnectionsStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Brain className="h-5 w-5" />}
          title="AI & Automation"
          description="AI executions, chat, models, and automation tools"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <AIExecutionsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <ChatUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <ModelsUsageStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <AIPromptsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <AIDatasetsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <AICronJobsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <CrawlersUsageStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Library className="h-5 w-5" />}
          title="Education"
          description="Courses, quizzes, and flashcards"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <CoursesStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <QuizzesStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <FlashcardsStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Key className="h-5 w-5" />}
          title="Developer"
          description="API keys and workspace secrets"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <APIKeysStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <SecretsStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>

        <UsageSection
          icon={<Plug className="h-5 w-5" />}
          title="Integrations"
          description="Third-party connections and email delivery"
        >
          <Suspense fallback={<LoadingStatisticCard />}>
            <DiscordIntegrationsStats wsId={workspace.id} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <SentEmailsStats wsId={workspace.id} />
          </Suspense>
        </UsageSection>
      </div>
    </div>
  );
}
