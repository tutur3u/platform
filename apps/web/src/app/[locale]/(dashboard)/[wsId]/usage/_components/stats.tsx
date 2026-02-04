import { createClient } from '@tuturuuu/supabase/next/server';
import { formatBytes } from '@tuturuuu/utils/format';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import StatisticCard from '@/components/cards/StatisticCard';

// ============================================================================
// Workspace Overview Stats
// ============================================================================

export async function WorkspaceMembersStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_members')) {
    return <StatisticCard title="Members" value="***" className="opacity-50" />;
  }

  const { data: count } = await supabase.rpc('get_workspace_users_count', {
    ws_id: wsId,
  });

  return <StatisticCard title="Members" value={count || 0} />;
}

export async function WorkspaceRolesStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_roles')) {
    return <StatisticCard title="Roles" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_roles')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Roles" value={count || 0} />;
}

export async function WorkspaceGroupsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_users')) {
    return (
      <StatisticCard title="User Groups" value="***" className="opacity-50" />
    );
  }

  const { data: count } = await supabase.rpc(
    'get_workspace_user_groups_count',
    { ws_id: wsId }
  );

  return <StatisticCard title="User Groups" value={count || 0} />;
}

export async function WorkspaceAgeStats({
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

// ============================================================================
// Content & Storage Stats
// ============================================================================

export async function DriveUsageStats({
  wsId,
  isRootWorkspace,
}: {
  wsId: string;
  isRootWorkspace: boolean;
}) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_drive')) {
    return (
      <StatisticCard title="Drive Storage" value="***" className="opacity-50" />
    );
  }

  try {
    const { data: files } = await supabase.storage
      .from('workspaces')
      .list(wsId, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      });

    const totalSize =
      files?.reduce((acc, file) => acc + (file.metadata?.size || 0), 0) || 0;

    const { data: storageLimit } = await supabase.rpc(
      'get_workspace_storage_limit',
      { ws_id: wsId }
    );

    const effectiveLimit = isRootWorkspace ? undefined : storageLimit;
    const displayValue = formatBytes(totalSize);
    const displayLimit = effectiveLimit
      ? formatBytes(effectiveLimit)
      : undefined;
    const progress = effectiveLimit ? (totalSize / effectiveLimit) * 100 : 0;

    return (
      <StatisticCard
        title="Drive Storage"
        value={totalSize}
        displayValue={displayValue}
        displayLimit={displayLimit}
        limit={effectiveLimit || undefined}
        progress={effectiveLimit ? progress : undefined}
      />
    );
  } catch {
    return <StatisticCard title="Drive Storage" value="Error" />;
  }
}

export async function DocumentsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_documents')) {
    return (
      <StatisticCard title="Documents" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_documents')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Documents" value={count || 0} />;
}

export async function PostsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('send_user_group_post_emails')) {
    return <StatisticCard title="Posts" value="***" className="opacity-50" />;
  }

  const { data: userGroups } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId);

  const userGroupIds = userGroups?.map((group) => group.id) || [];

  const { count } = await supabase
    .from('user_group_posts')
    .select('*', { count: 'exact', head: true })
    .in('group_id', userGroupIds);

  return <StatisticCard title="Posts" value={count || 0} />;
}

export async function LinksUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  const { count } = await supabase
    .from('shortened_links')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Short Links" value={count || 0} />;
}

// ============================================================================
// Finance Stats
// ============================================================================

export async function FinanceUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_finance')) {
    return (
      <StatisticCard title="Transactions" value="***" className="opacity-50" />
    );
  }

  const { data: count } = await supabase.rpc(
    'get_workspace_transactions_count',
    { ws_id: wsId }
  );

  return <StatisticCard title="Transactions" value={count || 0} />;
}

export async function InvoicesUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (
    !containsPermission('manage_finance') &&
    !containsPermission('view_invoices')
  ) {
    return (
      <StatisticCard title="Invoices" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('finance_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Invoices" value={count || 0} />;
}

export async function InventoryUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('view_inventory')) {
    return (
      <StatisticCard title="Products" value="***" className="opacity-50" />
    );
  }

  const { data: count } = await supabase.rpc('get_workspace_products_count', {
    ws_id: wsId,
  });

  return <StatisticCard title="Products" value={count || 0} />;
}

// ============================================================================
// Tasks & Projects Stats
// ============================================================================

export async function TaskBoardsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_projects')) {
    return <StatisticCard title="Boards" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_boards')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Boards" value={count || 0} />;
}

export async function TaskProjectsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_projects')) {
    return (
      <StatisticCard title="Projects" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('task_projects')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Projects" value={count || 0} />;
}

export async function TasksUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_projects')) {
    return (
      <StatisticCard title="Task Lists" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('task_lists')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Task Lists" value={count || 0} />;
}

// ============================================================================
// Time & Habits Stats
// ============================================================================

export async function TimeTrackingUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) {
    return (
      <StatisticCard title="Time Sessions" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('time_tracking_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('user_id', user.user.id);

  return <StatisticCard title="Time Sessions" value={count || 0} />;
}

export async function HabitsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_projects')) {
    return <StatisticCard title="Habits" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_habits')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Habits" value={count || 0} />;
}

// ============================================================================
// Calendar Stats
// ============================================================================

export async function CalendarEventsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_calendar')) {
    return (
      <StatisticCard
        title="Calendar Events"
        value="***"
        className="opacity-50"
      />
    );
  }

  const { count } = await supabase
    .from('workspace_calendar_events')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Calendar Events" value={count || 0} />;
}

export async function CalendarConnectionsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_calendar')) {
    return (
      <StatisticCard
        title="Connected Calendars"
        value="***"
        className="opacity-50"
      />
    );
  }

  const { count } = await supabase
    .from('calendar_connections')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Connected Calendars" value={count || 0} />;
}

// ============================================================================
// AI & Automation Stats
// ============================================================================

export async function AIExecutionsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
    return (
      <StatisticCard title="AI Executions" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_ai_executions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="AI Executions" value={count || 0} />;
}

export async function ChatUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_chat')) {
    return (
      <StatisticCard title="Chat Messages" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('ai_chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Chat Messages" value={count || 0} />;
}

export async function ModelsUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
    return (
      <StatisticCard title="AI Models" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_ai_models')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="AI Models" value={count || 0} />;
}

export async function AIPromptsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
    return (
      <StatisticCard title="AI Prompts" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_ai_prompts')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="AI Prompts" value={count || 0} />;
}

export async function AIDatasetsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
    return (
      <StatisticCard title="AI Datasets" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_datasets')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="AI Datasets" value={count || 0} />;
}

export async function AICronJobsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
    return (
      <StatisticCard title="Cron Jobs" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_cron_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Cron Jobs" value={count || 0} />;
}

export async function CrawlersUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('ai_lab')) {
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

  const { count } = await supabase
    .from('crawled_urls')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', user.id);

  return <StatisticCard title="Crawlers" value={count || 0} />;
}

// ============================================================================
// Education Stats
// ============================================================================

export async function CoursesStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_documents')) {
    return <StatisticCard title="Courses" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_courses')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Courses" value={count || 0} />;
}

export async function QuizzesStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_documents')) {
    return <StatisticCard title="Quizzes" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Quizzes" value={count || 0} />;
}

export async function FlashcardsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_documents')) {
    return (
      <StatisticCard title="Flashcards" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_flashcards')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Flashcards" value={count || 0} />;
}

// ============================================================================
// Developer Stats
// ============================================================================

export async function APIKeysStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_security')) {
    return (
      <StatisticCard title="API Keys" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('workspace_api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="API Keys" value={count || 0} />;
}

export async function SecretsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_secrets')) {
    return <StatisticCard title="Secrets" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('workspace_secrets')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Secrets" value={count || 0} />;
}

// ============================================================================
// Integrations Stats
// ============================================================================

export async function DiscordIntegrationsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_integrations')) {
    return <StatisticCard title="Discord" value="***" className="opacity-50" />;
  }

  const { count } = await supabase
    .from('discord_integrations')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Discord" value={count || 0} />;
}

export async function SentEmailsStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const { containsPermission } = await getPermissions({ wsId });

  if (!containsPermission('manage_workspace_audit_logs')) {
    return (
      <StatisticCard title="Sent Emails" value="***" className="opacity-50" />
    );
  }

  const { count } = await supabase
    .from('email_audit')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return <StatisticCard title="Sent Emails" value={count || 0} />;
}
