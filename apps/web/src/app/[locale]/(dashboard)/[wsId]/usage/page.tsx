import StatisticCard from '@/components/cards/StatisticCard';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Activity, Brain, HardDrive, Users } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Usage',
  description: 'Manage Usage in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function UsagePage({ params }: PageProps) {
  const t = await getTranslations();
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  if (!workspace) notFound();

  // Basic permission check - ensure user is a workspace member
  // Most usage statistics should be viewable by workspace members

  return (
    <div className="container mx-auto max-w-7xl space-y-6">
      <FeatureSummary
        title={t('sidebar_tabs.usage')}
        description="Monitor workspace activity, feature usage, and system metrics across your organization"
      />

      <Separator className="my-6" />

      {/* Workspace Overview */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="font-semibold text-xl">Workspace Overview</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceMembersStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceRolesStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceGroupsStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <WorkspaceAgeStats wsId={wsId} workspace={workspace} />
          </Suspense>
        </div>
      </div>

      {/* Feature Usage */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="font-semibold text-xl">Feature Usage</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<LoadingStatisticCard />}>
            <FinanceUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <InventoryUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <TasksUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <TimeTrackingUsageStats wsId={wsId} />
          </Suspense>
        </div>
      </div>

      {/* AI & Automation */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          <h2 className="font-semibold text-xl">AI & Automation</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<LoadingStatisticCard />}>
            <AIExecutionsStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <ChatUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <ModelsUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <CrawlersUsageStats wsId={wsId} />
          </Suspense>
        </div>
      </div>

      {/* Content & Storage */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          <h2 className="font-semibold text-xl">Content & Storage</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<LoadingStatisticCard />}>
            <DocumentsUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <DriveUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <PostsUsageStats wsId={wsId} />
          </Suspense>
          <Suspense fallback={<LoadingStatisticCard />}>
            <LinksUsageStats wsId={wsId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// Individual metric components
async function WorkspaceMembersStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_workspace_members')) {
    return <StatisticCard title="Members" value="***" className="opacity-50" />;
  }

  const { data: membersCount } = await supabase.rpc(
    'get_workspace_users_count',
    {
      ws_id: wsId,
    }
  );

  return (
    <StatisticCard
      title="Members"
      value={membersCount || 0}
      limit={1000}
      //   href={`/${wsId}/members`}
    />
  );
}

async function WorkspaceRolesStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_workspace_roles')) {
    return <StatisticCard title="Roles" value="***" className="opacity-50" />;
  }

  const { count: rolesCount } = await supabase
    .from('workspace_roles')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="Roles"
      value={rolesCount || 0}
      limit={100}
      //   href={`/${wsId}/roles`}
    />
  );
}

async function WorkspaceGroupsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_users')) {
    return (
      <StatisticCard title="User Groups" value="***" className="opacity-50" />
    );
  }

  const { data: groupsCount } = await supabase.rpc(
    'get_workspace_user_groups_count',
    {
      ws_id: wsId,
    }
  );

  return (
    <StatisticCard
      title="User Groups"
      value={groupsCount || 0}
      limit={100}
      //   href={`/${wsId}/users/groups`}
    />
  );
}

async function WorkspaceAgeStats({
  workspace,
}: {
  wsId: string;
  workspace: { created_at: string | null };
}) {
  if (!workspace.created_at) {
    return <StatisticCard title="Workspace Age" value="N/A" />;
  }

  const createdAt = new Date(workspace.created_at);
  const now = new Date();
  const ageInDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const displayAge =
    ageInDays < 30
      ? `${ageInDays}d`
      : ageInDays < 365
        ? `${Math.floor(ageInDays / 30)}mo`
        : `${Math.floor(ageInDays / 365)}y`;

  return <StatisticCard title="Workspace Age" value={displayAge} />;
}

async function FinanceUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_finance')) {
    return (
      <StatisticCard title="Transactions" value="***" className="opacity-50" />
    );
  }

  const { data: transactionsCount } = await supabase.rpc(
    'get_workspace_transactions_count',
    {
      ws_id: wsId,
    }
  );

  return (
    <StatisticCard
      title="Transactions"
      value={transactionsCount || 0}
      limit={1000}
      //   href={`/${wsId}/finance/transactions`}
    />
  );
}

async function InventoryUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('view_inventory')) {
    return (
      <StatisticCard title="Products" value="***" className="opacity-50" />
    );
  }

  const { data: productsCount } = await supabase.rpc(
    'get_workspace_products_count',
    {
      ws_id: wsId,
    }
  );

  return (
    <StatisticCard
      title="Products"
      value={productsCount || 0}
      limit={1000}
      //   href={`/${wsId}/inventory`}
    />
  );
}

async function TasksUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_projects')) {
    return <StatisticCard title="Tasks" value="***" className="opacity-50" />;
  }

  const { count: tasksCount } = await supabase
    .from('task_lists')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="Tasks"
      value={tasksCount || 0}
      limit={1000}
      //   href={`/${wsId}/tasks/boards`}
    />
  );
}

async function TimeTrackingUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) {
    return (
      <StatisticCard title="Time Sessions" value="***" className="opacity-50" />
    );
  }

  const { count: sessionsCount } = await supabase
    .from('time_tracking_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('user_id', user.user.id);

  return (
    <StatisticCard
      title="Time Sessions"
      value={sessionsCount || 0}
      limit={1000}
      //   href={`/${wsId}/time-tracker`}
    />
  );
}

async function AIExecutionsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('ai_lab')) {
    return (
      <StatisticCard title="AI Executions" value="***" className="opacity-50" />
    );
  }

  const { count: executionsCount } = await supabase
    .from('workspace_ai_executions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="AI Executions"
      value={executionsCount || 0}
      limit={1000}
      //   href={`/${wsId}/ai/executions`}
    />
  );
}

async function ChatUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('ai_chat')) {
    return (
      <StatisticCard title="Chat Messages" value="***" className="opacity-50" />
    );
  }

  const { count: messagesCount } = await supabase
    .from('ai_chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="Chat Messages"
      value={messagesCount || 0}
      limit={1000}
      //   href={`/${wsId}/chat`}
    />
  );
}

async function ModelsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('ai_lab')) {
    return (
      <StatisticCard title="AI Models" value="***" className="opacity-50" />
    );
  }

  const { count: modelsCount } = await supabase
    .from('ai_models')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="AI Models"
      value={modelsCount || 0}
      limit={100}
      //   href={`/${wsId}/models`}
    />
  );
}

async function CrawlersUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('ai_lab')) {
    return (
      <StatisticCard title="Crawlers" value="***" className="opacity-50" />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return <StatisticCard title="Crawlers" value="Error" />;
  }

  const { count: crawlersCount } = await supabase
    .from('crawled_urls')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', user.id);

  return (
    <StatisticCard
      title="Crawlers"
      value={crawlersCount || 0}
      limit={100}
      //   href={`/${wsId}/crawlers`}
    />
  );
}

async function DocumentsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_documents')) {
    return (
      <StatisticCard title="Documents" value="***" className="opacity-50" />
    );
  }

  const { count: documentsCount } = await supabase
    .from('workspace_documents')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="Documents"
      value={documentsCount || 0}
      limit={1000}
      //   href={`/${wsId}/documents`}
    />
  );
}

async function DriveUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('manage_drive')) {
    return (
      <StatisticCard title="Drive Files" value="***" className="opacity-50" />
    );
  }

  // Drive files are stored in Supabase Storage, not in database tables
  // We'll need to get the count from storage API
  try {
    const { data: files } = await supabase.storage
      .from('workspaces')
      .list(wsId, {
        limit: 1000, // Adjust as needed
        sortBy: { column: 'name', order: 'asc' },
      });

    const filesCount = files?.length || 0;

    return (
      <StatisticCard
        title="Drive Files"
        value={filesCount}
        limit={1000}
        // href={`/${wsId}/drive`}
      />
    );
  } catch {
    return (
      <StatisticCard
        title="Drive Files"
        value="Error"
        // href={`/${wsId}/drive`}
      />
    );
  }
}

async function PostsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { permissions } = await getPermissions({ wsId });

  if (!permissions.includes('send_user_group_post_emails')) {
    return <StatisticCard title="Posts" value="***" className="opacity-50" />;
  }

  // Get workspace user groups first
  const { data: userGroups } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId);

  const userGroupIds = userGroups?.map((group) => group.id) || [];

  const { count: postsCount } = await supabase
    .from('user_group_posts')
    .select('*', { count: 'exact', head: true })
    .in('group_id', userGroupIds);

  return (
    <StatisticCard
      title="Posts"
      value={postsCount || 0}
      limit={1000}
      //   href={`/${wsId}/posts`}
    />
  );
}

async function LinksUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  const { count: linksCount } = await supabase
    .from('shortened_links')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return (
    <StatisticCard
      title="Short Links"
      value={linksCount || 0}
      limit={1000}
      //   href={`/${wsId}/link-shortener`}
    />
  );
}
