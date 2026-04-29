import type { User as PrimitiveUser } from './primitives/User';
import type { Database, Tables } from './supabase';
import type { JSONContent } from './tiptap';

export type { Database } from './supabase';

type TaskActorRpcName =
  | 'add_task_label_with_actor'
  | 'link_task_project_with_actor'
  | 'remove_task_label_with_actor'
  | 'unlink_task_project_with_actor'
  | 'update_task_fields_with_actor'
  | 'update_task_with_relations';

export type TaskActorRpcArgs<T extends TaskActorRpcName> = Omit<
  Database['public']['Functions'][T]['Args'],
  'p_actor_user_id'
> & {
  p_actor_user_id: string;
};

export type AIChat = Tables<'ai_chats'>;
export type AIGatewayModel = Tables<'ai_gateway_models'>;

/**
 * UI-facing model representation derived from `ai_gateway_models`.
 * - `value`: gateway model ID (e.g. `"google/gemini-2.5-flash"`)
 * - `label`: display name (e.g. `"gemini-2.5-flash"`)
 * - `provider`: provider name (e.g. `"google"`)
 */
export interface AIModelUI {
  value: string;
  label: string;
  provider: string;
  description?: string;
  context?: number;
  disabled?: boolean;
  tags?: string[];
}

export type AIPrompt = Tables<'workspace_ai_prompts'>;
export type AIWhitelistEmail = Tables<'ai_whitelisted_emails'>;
export type WorkspaceAIExecution = Tables<'workspace_ai_executions'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;
export type GroupPostCheck = Tables<'user_group_post_checks'>;
export type UserGroupPost = Tables<'user_group_posts'> & {
  group_name?: string | null;
};
export type EmailHistoryEntry = Tables<'sent_emails'>;
export type AbuseEvent = Tables<'abuse_events'>;
export type Invoice = Tables<'finance_invoices'>;
export type InvoiceProduct = Tables<'finance_invoice_products'>;
export type InvoicePromotion = Tables<'finance_invoice_promotions'>;
export type InventoryOwner = Tables<'inventory_owners'>;
export type FinanceBudget = Tables<'finance_budgets'>;
export interface FinanceBudgetStatus {
  budget_id: string;
  budget_name: string;
  amount: number;
  spent: number;
  remaining: number;
  percentage_used: number;
  is_over_budget: boolean;
  is_near_threshold: boolean;
}
export type Workspace = Tables<'workspaces'>;
export type WorkspaceUser = Tables<'workspace_users'>;
export type InternalApiWorkspaceSummary = Pick<
  Workspace,
  'id' | 'name' | 'personal' | 'avatar_url' | 'logo_url'
> & {
  tier?: Database['public']['Enums']['workspace_product_tier'] | null;
  created_by_me?: boolean;
};
export type InternalApiWorkspaceMember = Pick<
  WorkspaceUser,
  'id' | 'display_name' | 'email' | 'avatar_url'
> & {
  user_id?: string;
  is_creator?: boolean;
};
export type InternalApiWorkspaceMemberRole = {
  id: string;
  name: string;
  permissions: Array<{ permission: string; enabled: boolean }>;
};
export type InternalApiWorkspaceDefaultPermission = {
  permission: string;
  enabled: boolean;
};
export type InternalApiEnhancedWorkspaceMember = PrimitiveUser & {
  is_creator: boolean;
  roles: InternalApiWorkspaceMemberRole[];
  default_permissions: InternalApiWorkspaceDefaultPermission[];
};
export type WorkspacePromotion = Tables<'workspace_promotions'>;
export type WorkspaceFlashcard = Tables<'workspace_flashcards'>;
export type WorkspaceQuiz = Tables<'workspace_quizzes'>;
export type WorkspaceWhiteboard = Tables<'workspace_whiteboards'>;
export type WorkspaceForm = Tables<'forms'>;
export type WorkspaceFormSection = Tables<'form_sections'>;
export type WorkspaceFormQuestion = Tables<'form_questions'>;
export type WorkspaceFormQuestionOption = Tables<'form_question_options'>;
export type WorkspaceFormLogicRule = Tables<'form_logic_rules'>;
export type WorkspaceFormShareLink = Tables<'form_share_links'>;
export type WorkspaceFormSession = Tables<'form_sessions'>;
export type WorkspaceFormResponse = Tables<'form_responses'>;
export type WorkspaceFormResponseAnswer = Tables<'form_response_answers'>;
export type WorkspaceTaskBoardRow = Tables<'workspace_boards'>;
export type WorkspaceTaskBoard = WorkspaceTaskBoardRow & {
  href?: string;
  lists?: Partial<WorkspaceTaskList>[];
};
export type WorkspaceTaskList = Tables<'task_lists'> & {
  tasks?: Partial<WorkspaceTask>[];
};
export type TaskListIdRow = Pick<Tables<'task_lists'>, 'id'>;
export type WorkspaceTask = Tables<'tasks'>;
export type TaskDraft = Tables<'task_drafts'>;
export type TaskRelationshipRow = Tables<'task_relationships'>;
export type RestorableTaskRow = Pick<Tables<'tasks'>, 'id' | 'list_id'>;
export type WorkspaceTaskPickerRow = Pick<
  Tables<'tasks'>,
  | 'id'
  | 'name'
  | 'display_number'
  | 'completed_at'
  | 'closed_at'
  | 'priority'
  | 'board_id'
> & {
  list: {
    board: {
      name: string | null;
    } | null;
  } | null;
};
export type TaskLabel = Tables<'workspace_task_labels'>;
export type TaskLabelSummary = Pick<
  Tables<'workspace_task_labels'>,
  'id' | 'name' | 'color' | 'created_at'
>;
export type TaskProject = Tables<'task_projects'>;
export type TaskProjectUpdate = Tables<'task_project_updates'>;
export type TaskCalendarEvent = Tables<'task_calendar_events'>;
export type TaskAssigneeRelationRow = Pick<
  Tables<'task_assignees'>,
  'user_id'
> & {
  user: Pick<Tables<'users'>, 'id' | 'display_name' | 'avatar_url'> | null;
};
export type TaskLabelRelationRow = {
  label: Pick<
    Tables<'workspace_task_labels'>,
    'id' | 'name' | 'color' | 'created_at'
  > | null;
};
export type TaskProjectRelationRow = {
  project: Pick<Tables<'task_projects'>, 'id' | 'name' | 'status'> | null;
};
export type TaskCounterpartLookupRow = Pick<
  Tables<'tasks'>,
  'id' | 'deleted_at'
> & {
  list: {
    board: Pick<Tables<'workspace_boards'>, 'ws_id'> | null;
  } | null;
};
export type TaskListDeletedRelationRow = {
  task_lists: Pick<Tables<'task_lists'>, 'deleted'> | null;
};
export type TaskRouteRecordRow = Pick<Tables<'tasks'>, 'id'> &
  TaskListDeletedRelationRow & {
    assignees: TaskAssigneeRelationRow[] | null;
    labels: TaskLabelRelationRow[] | null;
    projects: TaskProjectRelationRow[] | null;
  };
export type WorkspaceHabit = Tables<'workspace_habits'>;
export type WorkspaceHabitTracker = Tables<'workspace_habit_trackers'>;
export type WorkspaceHabitTrackerEntryRow =
  Tables<'workspace_habit_tracker_entries'>;
export type WorkspaceHabitTrackerStreakActionRow =
  Tables<'workspace_habit_tracker_streak_actions'>;
export type HabitCalendarEventRow = Tables<'habit_calendar_events'>;
export type HabitCompletionRow = Tables<'habit_completions'>;

/**
 * Calendar hours type for task scheduling
 */
export type CalendarHoursType =
  | 'work_hours'
  | 'personal_hours'
  | 'meeting_hours';

/**
 * Task with scheduling-related fields for auto-scheduling
 */
export type TaskWithScheduling = WorkspaceTask & {
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: CalendarHoursType | null;
  auto_schedule?: boolean | null;
  scheduled_events?: TaskCalendarEvent[];
  // Computed fields for progress tracking
  scheduled_minutes?: number;
  completed_minutes?: number;
  // Workspace context for cross-workspace scheduling
  ws_id?: string;
};

/**
 * Minimal user information for relations
 * Used across various entities (projects, tasks, comments, etc.)
 */
export type RelatedUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Task project with nested relations as returned from database queries
 * Used in project detail pages with full context
 */
export type TaskProjectWithRelations = TaskProject & {
  creator?: RelatedUser | null;
  lead?: RelatedUser | null;
};

/**
 * Project update with nested relations as returned from database queries
 * Used in project updates UI with creator info and reaction groups
 */
export type ProjectUpdate = TaskProjectUpdate & {
  creator?: {
    display_name?: string;
    avatar_url?: string;
  };
  reactionGroups?: Array<{
    emoji: string;
    count: number;
  }>;
};

/**
 * Task with nested relations as returned from database queries
 * Used in UI components that display task lists with full context
 */
export type TaskWithRelations = {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list_id?: string | null;
  created_at?: string | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
  projects?: Array<{
    project: TaskProject | null;
  }>;
  overrides?: TaskUserOverride | null;
};

export type TaskUserOverride = Tables<'task_user_overrides'>;
export type UserBoardListOverride = Tables<'user_board_list_overrides'>;
export type UserScopeOverrideStatus =
  Database['public']['Enums']['user_scope_override_status'];

export type WorkspaceCalendarEvent = Tables<'workspace_calendar_events'>;
export type WorkspaceCalendar = Tables<'workspace_calendars'>;
export type WorkspaceEncryptionKey = Tables<'workspace_encryption_keys'>;
export type CalendarConnection = Tables<'calendar_connections'>;

// Calendar enums
export type WorkspaceCalendarType =
  Database['public']['Enums']['workspace_calendar_type'];
export type CalendarProvider = Database['public']['Enums']['calendar_provider'];
export type CalendarSchedulingSource =
  Database['public']['Enums']['calendar_scheduling_source'];

export type User = Tables<'users'>;
export type UserPrivateDetails = Tables<'user_private_details'>;
export type PlatformUser = Tables<'platform_user_roles'>;
export type WorkspaceApiKey = Tables<'workspace_api_keys'>;
export type WorkspaceApiKeyUsageLog = {
  id: string;
  api_key_id: string;
  ws_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string | null;
  user_agent: string | null;
  response_time_ms: number | null;
  request_params: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};
export type WorkspaceQuizSet = Tables<'workspace_quiz_sets'> & {
  href?: string;
  usage?: {
    module_id: string;
    course_id: string;
    module_name: string;
    course_name: string;
  }[];
};
export type WorkspaceCourse = Tables<'workspace_user_groups'> & {
  href?: string;
};
export type WorkspaceCourseModule = Tables<'workspace_course_modules'> & {
  href?: string;
};
export type WorkspaceCourseBuilderCourse = Pick<
  Tables<'workspace_user_groups'>,
  'description' | 'id' | 'name' | 'ws_id'
>;
export type WorkspaceCourseBuilderModule = Pick<
  Tables<'workspace_course_modules'>,
  | 'content'
  | 'created_at'
  | 'extra_content'
  | 'group_id'
  | 'id'
  | 'is_public'
  | 'is_published'
  | 'module_group_id'
  | 'name'
  | 'sort_key'
  | 'youtube_links'
> & {
  flashcard_count: number;
  quiz_count: number;
  quiz_set_count: number;
};

export type WorkspaceCourseModuleGroup =
  Tables<'workspace_course_module_groups'>;
export type SharedCourseGroup = Pick<
  Tables<'workspace_user_groups'>,
  'description' | 'name'
>;
export type SharedCourseModule = Omit<
  Pick<
    Tables<'workspace_course_modules'>,
    | 'content'
    | 'created_at'
    | 'extra_content'
    | 'group_id'
    | 'id'
    | 'is_public'
    | 'is_published'
    | 'name'
    | 'sort_key'
    | 'youtube_links'
  >,
  'content'
> & {
  content: JSONContent | null;
  flashcards: number;
  quizzes: number;
  quizSets: number;
};
export type WorkspaceAIModel = Tables<'workspace_ai_models'> & {
  href?: string;
};
export type WorkspaceDataset = Tables<'workspace_datasets'> & {
  href?: string;
};
export type CrawledUrl = Tables<'crawled_urls'> & {
  href?: string;
};
export type WorkspaceCronJob = Tables<'workspace_cron_jobs'> & {
  href?: string;
};
export type WorkspaceCronExecution = Tables<'workspace_cron_executions'> & {
  href?: string;
};
export type AIWhitelistDomain = Tables<'ai_whitelisted_domains'>;
export type CanonicalExternalProject = Tables<'canonical_external_projects'>;
export type ExternalProjectCollection =
  Tables<'workspace_external_project_collections'>;
export type ExternalProjectEntry = Tables<'workspace_external_project_entries'>;
export type ExternalProjectBlock = Tables<'workspace_external_project_blocks'>;
export type ExternalProjectAsset = Tables<'workspace_external_project_assets'>;
export type ExternalProjectTaxonomy =
  Tables<'workspace_external_project_taxonomies'>;
export type ExternalProjectEntryRelation =
  Tables<'workspace_external_project_entry_relations'>;
export type ExternalProjectImportJob =
  Tables<'workspace_external_project_import_jobs'>;
export type ExternalProjectPublishEvent =
  Tables<'workspace_external_project_publish_events'>;
export type WorkspaceExternalProjectBindingAudit =
  Tables<'workspace_external_project_binding_audits'>;
export type ExternalProjectAdapterKind =
  Database['public']['Enums']['external_project_adapter_kind'];
export type ExternalProjectEntryStatus =
  Database['public']['Enums']['external_project_entry_status'];
export type ExternalProjectImportStatus =
  Database['public']['Enums']['external_project_import_status'];
export type ExternalProjectPublishEventKind =
  Database['public']['Enums']['external_project_publish_event_kind'];
export type PermissionId =
  | Database['public']['Enums']['workspace_role_permission']
  | 'change_finance_wallets'
  | 'set_finance_wallets_on_create';

export type WorkspaceExternalProjectBinding = {
  enabled: boolean;
  canonical_id: string | null;
  workspace_id: string;
  canonical_project: CanonicalExternalProject | null;
  adapter: ExternalProjectAdapterKind | null;
};
export type ExternalProjectWorkspaceBindingSummary =
  InternalApiWorkspaceSummary & {
    binding: WorkspaceExternalProjectBinding;
    last_actor_user_id: string | null;
    last_audit_id: string | null;
    last_changed_at: string | null;
    last_next_canonical_id: string | null;
    last_previous_canonical_id: string | null;
  };

export type ExternalProjectStudioAsset = ExternalProjectAsset & {
  asset_url: string | null;
  preview_url: string | null;
};

export type ExternalProjectDeliveryAsset = Pick<
  ExternalProjectAsset,
  | 'id'
  | 'entry_id'
  | 'block_id'
  | 'asset_type'
  | 'storage_path'
  | 'source_url'
  | 'alt_text'
  | 'sort_order'
  | 'metadata'
> & {
  assetUrl: string | null;
};

export type ExternalProjectDeliveryEntry = Pick<
  ExternalProjectEntry,
  | 'id'
  | 'slug'
  | 'title'
  | 'subtitle'
  | 'summary'
  | 'status'
  | 'published_at'
  | 'profile_data'
  | 'metadata'
> & {
  blocks: ExternalProjectBlock[];
  assets: ExternalProjectDeliveryAsset[];
};

export type ExternalProjectDeliveryCollection = Pick<
  ExternalProjectCollection,
  'id' | 'slug' | 'title' | 'collection_type' | 'description' | 'config'
> & {
  entries: ExternalProjectDeliveryEntry[];
};

export type YoolaExternalProjectArtworkLoadingItem = {
  entryId: string;
  slug: string;
  title: string;
  summary: string | null;
  caption: string | null;
  label: string | null;
  category: string | null;
  rarity: string | null;
  orientation: string | null;
  year: string | null;
  note: string | null;
  width: number | null;
  height: number | null;
  assetId: string | null;
  assetUrl: string | null;
  altText: string | null;
};

export type YoolaExternalProjectLoreCapsuleLoadingItem = {
  entryId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  teaser: string | null;
  channel: string | null;
  status: string | null;
  date: string | null;
  tags: string[];
  excerptMarkdown: string | null;
  bodyMarkdown: string | null;
  artworkEntryId: string | null;
  artworkAssetUrl: string | null;
  profileData: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type YoolaExternalProjectSectionLoadingItem = {
  entryId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  bodyMarkdown: string | null;
  profileData: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type YoolaExternalProjectLoadingData = {
  adapter: 'yoola';
  featuredArtwork: YoolaExternalProjectArtworkLoadingItem | null;
  artworks: YoolaExternalProjectArtworkLoadingItem[];
  artworkCategories: string[];
  artworksByCategory: Record<string, YoolaExternalProjectArtworkLoadingItem[]>;
  loreCapsules: YoolaExternalProjectLoreCapsuleLoadingItem[];
  singletonSections: Record<string, YoolaExternalProjectSectionLoadingItem>;
};

export type ExternalProjectLoadingData =
  | YoolaExternalProjectLoadingData
  | {
      adapter: Exclude<ExternalProjectAdapterKind, 'yoola'>;
      sections: Record<string, unknown>;
    };

export type ExternalProjectDeliveryPayload = {
  workspaceId: string;
  canonicalProjectId: string;
  adapter: ExternalProjectAdapterKind;
  generatedAt: string;
  collections: ExternalProjectDeliveryCollection[];
  profileData: Record<string, unknown>;
  loadingData: ExternalProjectLoadingData | null;
};

export type ExternalProjectStudioData = {
  collections: ExternalProjectCollection[];
  entries: ExternalProjectEntry[];
  blocks: ExternalProjectBlock[];
  assets: ExternalProjectStudioAsset[];
  importJobs: ExternalProjectImportJob[];
  publishEvents: ExternalProjectPublishEvent[];
  loadingData: ExternalProjectLoadingData | null;
};

export type ExternalProjectSummaryCollection = {
  id: string;
  slug: string;
  title: string;
  isEnabled: boolean;
  totalEntries: number;
  draftEntries: number;
  scheduledEntries: number;
  publishedEntries: number;
  archivedEntries: number;
};

export type ExternalProjectSummaryCounts = {
  collections: number;
  entries: number;
  drafts: number;
  scheduled: number;
  published: number;
  archived: number;
};

export type ExternalProjectAttentionKind =
  | 'scheduled_soon'
  | 'missing_media'
  | 'recently_imported_unpublished'
  | 'archived_backlog';

export type ExternalProjectAttentionItem = {
  collectionId: string;
  collectionTitle: string;
  detail: string;
  entryId: string;
  kind: ExternalProjectAttentionKind;
  scheduledFor: string | null;
  slug: string;
  status: ExternalProjectEntryStatus;
  summary: string | null;
  title: string;
};

export type ExternalProjectSummaryQueues = {
  archivedBacklog: ExternalProjectAttentionItem[];
  draftsMissingMedia: ExternalProjectAttentionItem[];
  recentlyImportedUnpublished: ExternalProjectAttentionItem[];
  scheduledSoon: ExternalProjectAttentionItem[];
};

export type ExternalProjectSummary = {
  adapter: ExternalProjectAdapterKind | null;
  canonicalProjectId: string | null;
  collections: ExternalProjectSummaryCollection[];
  counts: ExternalProjectSummaryCounts;
  queues: ExternalProjectSummaryQueues;
  recentActivity: {
    importJobs: ExternalProjectImportJob[];
    publishEvents: ExternalProjectPublishEvent[];
  };
  workspaceId: string;
};

export type ExternalProjectBulkUpdateAction =
  | 'archive'
  | 'publish'
  | 'restore-draft'
  | 'schedule'
  | 'set-status'
  | 'unpublish';

export type ExternalProjectBulkUpdatePayload = {
  action: ExternalProjectBulkUpdateAction;
  entryIds: string[];
  scheduledFor?: string | null;
  status?: ExternalProjectEntryStatus;
};

export type ExternalProjectImportReport = {
  adapter: ExternalProjectAdapterKind;
  canonicalProjectId: string;
  createdCollections: number;
  updatedCollections: number;
  createdEntries: number;
  updatedEntries: number;
  createdBlocks: number;
  updatedBlocks: number;
  createdAssets: number;
  updatedAssets: number;
  sourceReference: string;
  warnings: string[];
};

export type WorkspaceRole = Tables<'workspace_roles'> & {
  permissions: {
    id: PermissionId;
    enabled: boolean;
  }[];
  user_count?: number;
  members?: Array<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  }>;
};

export type PermissionSource = 'creator' | 'default' | 'role';

export type PermissionWithSource = {
  id: PermissionId;
  enabled: boolean;
  source: PermissionSource;
  source_name?: string; // role name if source is 'role'
};

export type MemberWithPermissions = {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  };
  is_creator: boolean;
  roles: Array<{
    id: string;
    name: string;
    permissions: Array<{ id: PermissionId; enabled: boolean }>;
  }>;
  default_permissions: Array<{ id: PermissionId; enabled: boolean }>;
  total_permissions: number;
};

export type WorkspaceUserReport = Tables<'external_user_monthly_reports'> & {
  href?: string;
};

/**
 * Raw report data from Supabase query with joins
 * Represents the shape of data returned from the reports approval query
 */
export type ReportApprovalQueryResult = {
  id: string;
  title: string;
  content: string;
  feedback: string;
  score: number | null;
  scores: number[] | null;
  created_at: string;
  updated_by?: string | null;
  user_id?: string | null;
  group_id?: string | null;
  creator_id?: string | null;
  report_approval_status: Database['public']['Enums']['approval_status'];
  rejection_reason: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  modifier?: {
    full_name?: string | null;
    display_name?: string | null;
    email?: string | null;
  } | null;
  creator?: {
    full_name?: string | null;
  } | null;
  user?:
    | {
        full_name?: string | null;
      }
    | Array<{
        full_name?: string | null;
      }>
    | null;
  group_name?: string | null;
};

/**
 * Normalized user shape - always a single object or null
 */
export type NormalizedUser = {
  full_name?: string | null;
} | null;

/**
 * Normalizes the ambiguous user field from ReportApprovalQueryResult
 * Handles both single object and array shapes, returning a consistent single object or null
 *
 * @param user - The user field from ReportApprovalQueryResult (object | array | null)
 * @returns A normalized user object or null
 *
 * @example
 * const normalizedUser = normalizeUser(report.user);
 * console.log(normalizedUser?.full_name); // Always safe to access
 */
export function normalizeUser(
  user: ReportApprovalQueryResult['user']
): NormalizedUser {
  if (!user) return null;
  if (Array.isArray(user)) {
    const first = user[0];
    return first ?? null;
  }
  return user;
}

/**
 * Report approval item with computed user_name field
 * Used in approvals view for external user monthly reports
 */
export type ReportApprovalItem = Omit<
  ReportApprovalQueryResult,
  'user' | 'creator'
> & {
  user_name?: string | null;
  modifier_name?: string | null;
  creator_name?: string | null;
};

/**
 * Report log entry for comparison view
 * Represents a snapshot of a report from the logs table
 */
export type ReportLogEntry = Tables<'external_user_monthly_report_logs'>;

/**
 * Raw post data from Supabase query with joins
 * Represents the shape of data returned from the posts approval query
 */
export type PostApprovalQueryResult = {
  id: string;
  post_id?: string | null;
  title: string | null;
  content: string | null;
  notes: string | null;
  created_at: string;
  updated_by?: string | null;
  post_approval_status: Database['public']['Enums']['approval_status'];
  rejection_reason: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  user_id?: string | null;
  user_name?: string | null;
  is_completed?: boolean | null;
  modifier?: {
    full_name?: string | null;
    display_name?: string | null;
    email?: string | null;
  } | null;
  group_name?: string | null;
  group_id?: string | null;
};

/**
 * Post approval item with joined group data
 * Used in approvals view for user group posts
 */
export type PostApprovalItem = PostApprovalQueryResult & {
  modifier_name?: string | null;
  can_remove_approval?: boolean;
  queue_counts?: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
};

/**
 * Post log entry for comparison view
 * Represents a snapshot of a post from the logs table
 */
export type PostLogEntry = Tables<'user_group_post_logs'>;

export type WorkspaceCalendarGoogleToken = Tables<'calendar_auth_tokens'>;
export type InternalEmail = Tables<'internal_emails'>;

export type TimeTrackingCategory = Tables<'time_tracking_categories'>;
export type TimeTrackingSession = Tables<'time_tracking_sessions'>;
export type TimeTrackingGoal = Tables<'time_tracking_goals'>;
export type TimeTrackingGoalWithCategory = TimeTrackingGoal & {
  category: TimeTrackingCategory | null;
};

/**
 * Period statistics for time tracking sessions
 * Used across web and mobile apps for session history analytics
 */
export interface TimeTrackingPeriodStats {
  totalDuration: number;
  breakdown: { name: string; duration: number; color: string }[];
  timeOfDayBreakdown: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  bestTimeOfDay: string;
  longestSession: {
    title: string;
    duration_seconds: number | null;
  } | null;
  shortSessions: number;
  mediumSessions: number;
  longSessions: number;
  sessionCount: number;
  dailyBreakdown?: {
    date: string;
    totalDuration: number;
    breakdown: {
      categoryId: string;
      name: string;
      duration: number;
      color: string;
    }[];
  }[];
}

export type AuroraStatisticalForecast = Tables<'aurora_statistical_forecast'>;
export type AuroraStatisticalMetrics = Tables<'aurora_statistical_metrics'>;
export type AuroraMLForecast = Tables<'aurora_ml_forecast'>;
export type AuroraMLMetrics = Tables<'aurora_ml_metrics'>;
export type AuroraForecast = {
  statistical_forecast: AuroraStatisticalForecast[];
  ml_forecast: AuroraMLForecast[];
};

export type NovaChallengeCriteria = Tables<'nova_challenge_criteria'>;
export type NovaChallenge = Tables<'nova_challenges'>;
export type NovaChallengeWhitelistedEmail =
  Tables<'nova_challenge_whitelisted_emails'>;
export type NovaProblemTestCase = Tables<'nova_problem_test_cases'>;
export type NovaProblem = Tables<'nova_problems'>;
export type NovaRole = Tables<'platform_email_roles'>;
export type NovaRoleBasic = Pick<
  Tables<'platform_email_roles'>,
  'email' | 'enabled' | 'created_at'
>;
export type NovaSession = Tables<'nova_sessions'>;
export type NovaSubmission = Tables<'nova_submissions'>;
export type NovaSubmissionCriteria = Tables<'nova_submission_criteria'>;
export type NovaSubmissionTestCase = Tables<'nova_submission_test_cases'>;
export type NovaSubmissionWithScores = Tables<'nova_submissions_with_scores'>;
export type NovaSubmissionWithScoresAndCriteria =
  Tables<'nova_submissions_with_scores'> & {
    criteria: NovaChallengeCriteria[];
  };

export type ExtendedNovaProblem = NovaProblem & {
  test_cases?: NovaProblemTestCase[];
  challenge?: {
    id: string;
    title: string;
  };
};

export type NovaExtendedChallenge = NovaChallenge & {
  criteria?: NovaChallengeCriteria[];
  whitelists?: NovaChallengeWhitelistedEmail[];
  managingAdmins?: string[];
  canManage?: boolean;
  lastSession: NovaSession | null;
  total_sessions?: number;
  daily_sessions?: number;
};

export type NovaSubmissionData = NovaSubmissionWithScores & {
  session: NovaSession | null;
  problem: NovaProblem;
  challenge: NovaChallenge;
  criteria: (NovaSubmissionCriteria & { name: string; description: string })[];
  test_cases: (NovaSubmissionTestCase & {
    input: string;
    expected_output: string;
  })[];
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  };
};
export type CourseCertificate = Tables<'course_certificates'>;
export type CertificateTemplate =
  Database['public']['Enums']['certificate_templates'];

export type WorkspaceEducationAccessRequest =
  Tables<'workspace_education_access_requests'>;

export type RecordingStatus = Database['public']['Enums']['recording_status'];
export type RecordingTranscript = Tables<'recording_transcripts'>;

export type SupportInquiry = Tables<'support_inquiries'>;
export type SupportType = Database['public']['Enums']['support_type'];
export type Product = Database['public']['Enums']['product'];

export type WorkspaceSubscription = Tables<'workspace_subscriptions'>;
export type WorkspaceSubscriptionProduct =
  Tables<'workspace_subscription_products'>;
export type WorkspaceSubscriptionWithProduct = WorkspaceSubscription & {
  workspace_subscription_products: WorkspaceSubscriptionProduct | null;
};
export type WorkspaceProductTier =
  Database['public']['Enums']['workspace_product_tier'];
export type SubscriptionStatus =
  Database['public']['Enums']['subscription_status'];

// Workforce & Payroll types
export type WorkforceContractType =
  Database['public']['Enums']['workforce_contract_type'];
export type WorkforceEmploymentStatus =
  Database['public']['Enums']['workforce_employment_status'];
export type WorkforcePaymentFrequency =
  Database['public']['Enums']['workforce_payment_frequency'];
export type WorkforceBenefitType =
  Database['public']['Enums']['workforce_benefit_type'];
export type PayrollRunStatus =
  Database['public']['Enums']['payroll_run_status'];

export type WorkforceContract = Tables<'workforce_contracts'>;
export type WorkforceCompensation = Tables<'workforce_compensation'>;
export type WorkforceBenefit = Tables<'workforce_benefits'>;
export type PayrollRun = Tables<'payroll_runs'>;
export type PayrollRunItem = Tables<'payroll_run_items'>;

// Extended workforce types with relations
export type WorkforceContractWithCompensation = WorkforceContract & {
  compensation?: WorkforceCompensation[];
  benefits?: WorkforceBenefit[];
};

export type WorkforceUserProfile = WorkspaceUser & {
  contracts?: WorkforceContractWithCompensation[];
  current_contract?: WorkforceContract | null;
};

export type LimitRow = Tables<'platform_entity_creation_limits'>;
