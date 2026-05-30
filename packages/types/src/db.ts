import type { User as PrimitiveUser } from './primitives/User';
import type { Database, Json, Tables } from './supabase';
import type { JSONContent } from './tiptap';

export type { Database, Json } from './supabase';

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

type PrivateTable<TableName extends keyof Database['private']['Tables']> =
  Tables<{ schema: 'private' }, TableName>;

export type AIChat = Tables<'ai_chats'>;
export type MailAttachment = PrivateTable<'mail_attachments'>;
export type MailEvent = PrivateTable<'mail_events'>;
export type MailInboundJob = PrivateTable<'mail_inbound_jobs'>;
export type MailLabel = PrivateTable<'mail_labels'>;
export type MailMailbox = PrivateTable<'mail_mailboxes'>;
export type MailMailboxMember = PrivateTable<'mail_mailbox_members'>;
export type MailMessage = PrivateTable<'mail_messages'>;
export type MailMessageLabel = PrivateTable<'mail_message_labels'>;
export type MailMessageUserState = PrivateTable<'mail_message_user_state'>;
export type MailOutboundJob = PrivateTable<'mail_outbound_jobs'>;
export type MailRawMessage = PrivateTable<'mail_raw_messages'>;
export type MailRecipient = PrivateTable<'mail_recipients'>;
export type MailThread = PrivateTable<'mail_threads'>;
export type AIGatewayModel = Tables<'ai_gateway_models'>;
export type MindBoardStatus = 'active' | 'archived';
export type MindHorizon =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'five_year'
  | 'ten_year'
  | 'fifty_year'
  | 'long_arc';
export type MindNodeType =
  | 'decision'
  | 'goal'
  | 'idea'
  | 'milestone'
  | 'plan'
  | 'question'
  | 'resource'
  | 'risk'
  | 'system';
export type MindNodeStatus =
  | 'backlog'
  | 'planned'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'completed'
  | 'deferred'
  | 'cancelled';
export type MindEdgeType =
  | 'blocks'
  | 'contains'
  | 'contradicts'
  | 'custom'
  | 'depends_on'
  | 'reference'
  | 'relates_to'
  | 'sequence'
  | 'supports';
export type MindEntityLinkType =
  | 'calendar_event'
  | 'custom'
  | 'document'
  | 'external_url'
  | 'project'
  | 'task'
  | 'workspace';

export type MindJsonObject = { [key: string]: Json | undefined };

export interface MindBoard {
  canvasView: MindJsonObject | null;
  createdAt: string;
  defaultHorizon: MindHorizon;
  description: string | null;
  id: string;
  settings: MindJsonObject;
  status: MindBoardStatus;
  title: string;
  updatedAt: string;
  wsId: string;
}

export interface MindNode {
  body: string | null;
  color: string | null;
  createdAt: string;
  height: number;
  horizon: MindHorizon;
  id: string;
  metadata: MindJsonObject;
  nodeType: MindNodeType;
  parentNodeId: string | null;
  positionX: number;
  positionY: number;
  status: MindNodeStatus;
  title: string;
  updatedAt: string;
  width: number;
}

export interface MindEdge {
  color: string | null;
  createdAt: string;
  edgeType: MindEdgeType;
  id: string;
  label: string | null;
  metadata: MindJsonObject;
  sourceNodeId: string;
  targetNodeId: string;
  updatedAt: string;
  weight: number;
}

export interface MindTag {
  color: string | null;
  createdAt: string;
  id: string;
  name: string;
  nodeIds: string[];
}

export interface MindGroup {
  color: string | null;
  createdAt: string;
  id: string;
  name: string;
  nodeIds: string[];
}

export interface MindNodeLink {
  createdAt: string;
  entityId: string | null;
  entityType: MindEntityLinkType;
  id: string;
  label: string | null;
  metadata: MindJsonObject;
  nodeId: string;
  url: string | null;
}

export interface MindBoardSummary extends MindBoard {
  edgeCount: number;
  nodeCount: number;
  tagCount: number;
}

export interface MindBoardSnapshot {
  board: MindBoardSummary;
  edges: MindEdge[];
  groups: MindGroup[];
  links: MindNodeLink[];
  nodes: MindNode[];
  tags: MindTag[];
}

export type MindPatchOperation =
  | {
      id: string;
      kind: 'create_node';
      node: Partial<MindNode> &
        Pick<MindNode, 'id' | 'positionX' | 'positionY' | 'title'>;
    }
  | ({
      id: string;
      kind: 'update_node';
      nodeId: string;
    } & Partial<
      Pick<
        MindNode,
        | 'body'
        | 'color'
        | 'height'
        | 'horizon'
        | 'metadata'
        | 'nodeType'
        | 'parentNodeId'
        | 'positionX'
        | 'positionY'
        | 'status'
        | 'title'
        | 'width'
      >
    >)
  | {
      id: string;
      kind: 'delete_node';
      nodeId: string;
    }
  | {
      edge: Partial<MindEdge> &
        Pick<MindEdge, 'id' | 'sourceNodeId' | 'targetNodeId'>;
      id: string;
      kind: 'create_edge';
    }
  | ({
      edgeId: string;
      id: string;
      kind: 'update_edge';
    } & Partial<
      Pick<
        MindEdge,
        | 'color'
        | 'edgeType'
        | 'label'
        | 'metadata'
        | 'sourceNodeId'
        | 'targetNodeId'
        | 'weight'
      >
    >)
  | {
      edgeId: string;
      id: string;
      kind: 'delete_edge';
    };

export interface MindAiPatch {
  operations: MindPatchOperation[];
  summary: string;
}

export interface MindAiPatchRecord {
  appliedAt: string | null;
  boardId: string;
  createdAt: string;
  createdBy: string;
  id: string;
  patch: MindAiPatch;
  status: 'applied' | 'draft' | 'rejected';
  summary: string;
  threadId: string | null;
}

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
export type AIWhitelistEmail = Tables<
  { schema: 'private' },
  'ai_whitelisted_emails'
>;
export type WorkspaceAIExecution = Tables<'workspace_ai_executions'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;
export type GroupPostCheck = Tables<'user_group_post_checks'>;
export type NotificationBatch = Tables<
  { schema: 'private' },
  'notification_batches'
>;
export type NotificationDeliveryLog = Tables<
  { schema: 'private' },
  'notification_delivery_log'
>;
export type HiveMember = Tables<'hive_members'>;
export type HiveNpc = Tables<'hive_npcs'>;
export type HiveNpcMemory = Tables<'hive_npc_memories'>;
export type HiveNpcRun = Tables<'hive_npc_runs'>;
export type HiveServer = Tables<'hive_servers'>;
export type HiveWorkflow = Tables<'hive_workflows'>;
export type HiveWorkflowRun = Tables<'hive_workflow_runs'>;
export type HiveWorldEvent = Tables<'hive_world_events'>;
export type HiveWorldState = Tables<'hive_world_states'>;
export type UserGroupPost = Tables<'user_group_posts'> & {
  group_name?: string | null;
};
export interface WorkspaceUserGroupTableRow {
  id: string;
  ws_id: string;
  name: string;
  starting_date: string | null;
  ending_date: string | null;
  archived: boolean;
  notes: string | null;
  is_guest: boolean;
  amount: number;
  sessions: string[] | null;
  created_at: string | null;
  has_session_today: boolean;
}
export type TulearnGamificationEvent = Tables<'tulearn_gamification_events'>;
export type TulearnLearnerState = Tables<'tulearn_learner_state'>;
export type TulearnParentInvite = Tables<'tulearn_parent_invites'>;
export type TulearnParentStudentLink = Tables<'tulearn_parent_student_links'>;
export type QrLoginChallenge = Tables<'qr_login_challenges'>;
export type EmailHistoryEntry = Tables<'sent_emails'>;
export type AbuseEvent = Tables<'abuse_events'>;
export type AbuseActivitySignal = Tables<'abuse_activity_signals'>;
export type AbuseReputationSubject = Tables<'abuse_reputation_subjects'>;
export type AbuseStepUpChallenge = Tables<'abuse_step_up_challenges'>;
export type AbuseTrustOverride = Tables<'abuse_trust_overrides'>;
export type Invoice = Tables<'finance_invoices'>;
export type InvoiceProduct = Tables<'finance_invoice_products'>;
export type InvoicePromotion = Tables<'finance_invoice_promotions'>;
export type InventoryOwner = PrivateTable<'inventory_owners'>;
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
export type WorkspaceTutoringSession = Tables<'workspace_tutoring_sessions'> & {
  attendance_status: 'PENDING' | 'DONE' | 'NO_SHOW' | 'CANCELLED';
  reason_type: 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'CUSTOM';
};
export type TopicAnnouncement = Tables<'topic_announcements'>;
export type TopicAnnouncementBatch = Tables<'topic_announcement_batches'>;
export type TopicAnnouncementContact = Tables<'topic_announcement_contacts'>;
export type TopicAnnouncementContactVerification =
  Tables<'topic_announcement_contact_verifications'>;
export type TopicAnnouncementRecipient =
  Tables<'topic_announcement_recipients'>;
export interface WorkspaceStorageFileMetadata {
  size?: number;
  mimetype?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface WorkspaceStorageFile {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: WorkspaceStorageFileMetadata | null;
}

export type InternalApiWorkspaceSummary = Pick<
  Workspace,
  'id' | 'name' | 'personal' | 'avatar_url' | 'logo_url'
> & {
  access_type?: 'member' | 'guest';
  tier?: Database['public']['Enums']['workspace_product_tier'] | null;
  created_by_me?: boolean;
  guest_board_count?: number;
  guest_highest_permission?: 'view' | 'edit' | null;
  guest_landing_path?: string | null;
  guest_products?: Array<'tasks'>;
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
  direct_board_guest?: boolean;
  guest_access_type?: 'task_board';
  guest_board_count?: number;
  guest_board_names?: string[];
  guest_highest_permission?: 'view' | 'edit' | null;
  is_creator: boolean;
  roles: InternalApiWorkspaceMemberRole[];
  default_permissions: InternalApiWorkspaceDefaultPermission[];
  workspace_user_id?: string | null;
  workspace_profile_display_name?: string | null;
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

type TaskUserOverrideRow = Tables<'task_user_overrides'>;
export type TaskUserOverride = Omit<
  TaskUserOverrideRow,
  | 'personal_added_at'
  | 'personal_board_id'
  | 'personal_list_id'
  | 'personal_placed_at'
  | 'personal_sort_key'
> & {
  personal_board_id?: string | null;
  personal_list_id?: string | null;
  personal_sort_key?: number | null;
  personal_added_at?: string | null;
  personal_placed_at?: string | null;
};
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
export type AIWhitelistDomain = Tables<
  { schema: 'private' },
  'ai_whitelisted_domains'
>;
export type CanonicalExternalProject = Tables<'canonical_external_projects'>;
export type ExternalProjectCollection =
  Tables<'workspace_external_project_collections'>;
export type ExternalProjectEntry = Tables<'workspace_external_project_entries'>;
export type ExternalProjectBlock = Tables<'workspace_external_project_blocks'>;
export type ExternalProjectAsset = Tables<'workspace_external_project_assets'>;
export type ExternalProjectFieldDefinition =
  Tables<'workspace_external_project_field_definitions'>;
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
export type ExternalProjectFieldScope =
  Database['public']['Enums']['external_project_field_scope'];
export type ExternalProjectFieldType =
  Database['public']['Enums']['external_project_field_type'];
export type PermissionId =
  | Database['public']['Enums']['workspace_role_permission']
  | 'change_finance_wallets'
  | 'view_chat'
  | 'create_chat'
  | 'manage_chat'
  | 'moderate_chat'
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

export type CmsEditorCollectionView = {
  id: string;
  label: string;
  description?: string | null;
  collectionSlugs?: string[];
  collectionTypes?: string[];
  includeAll?: boolean;
  navigationLabel?: string | null;
  createCollection?: {
    collectionType: string;
    description?: string | null;
    emptyHint?: string | null;
    entryTitle?: string | null;
    slug?: string | null;
    title: string;
  } | null;
};

export type CmsEditorTaxonomyConfig = {
  id: string;
  label: string;
  categoryField?: string | null;
  collectionSlugs?: string[];
  collectionTypes?: string[];
  sectionCollectionSlugs?: string[];
  sectionCollectionTypes?: string[];
  sectionSlug: string;
  sectionTitle: string;
  tagField?: string | null;
};

export type CmsEditorFeaturedEntryRule = {
  id: string;
  label: string;
  collectionSlugs?: string[];
  collectionTypes?: string[];
  metadataKey: string;
  maxItems?: number | null;
};

export type CmsEditorCapabilities = {
  version: 1;
  adapter: ExternalProjectAdapterKind | null;
  appLabel: string;
  navigationLabel: string;
  defaultViewId: string;
  collectionViews: CmsEditorCollectionView[];
  media: {
    enabled: boolean;
    assetTypes: string[];
    supportsAltText: boolean;
    supportsCoverSelection: boolean;
    supportsUploads: boolean;
  };
  contentModel: {
    enabled: boolean;
    fieldDefinitionsEnabled: boolean;
  };
  workflow: {
    enabled: boolean;
    scheduledPublishingEnabled: boolean;
    statuses: ExternalProjectEntryStatus[];
  };
  preview: {
    enabled: boolean;
    entryPreviewEnabled: boolean;
  };
  taxonomies: CmsEditorTaxonomyConfig[];
  featuredEntryRules: CmsEditorFeaturedEntryRule[];
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
  fieldDefinitions: ExternalProjectFieldDefinition[];
  importJobs: ExternalProjectImportJob[];
  publishEvents: ExternalProjectPublishEvent[];
  cmsCapabilities?: CmsEditorCapabilities | null;
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

export type ExternalProjectSyncFieldType =
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'markdown'
  | 'number'
  | 'string'
  | 'string-array';

export type ExternalProjectSyncField = {
  defaultValue?: Json;
  description?: string | null;
  key: string;
  label?: string | null;
  options?: string[];
  required?: boolean;
  type: ExternalProjectSyncFieldType;
};

export type ExternalProjectSyncCollectionSchema = {
  assetTypes?: string[];
  blockTypes?: string[];
  collection_type: string;
  config?: Record<string, unknown>;
  description?: string | null;
  metadataFields?: ExternalProjectSyncField[];
  profileFields?: ExternalProjectSyncField[];
  slug: string;
  title: string;
};

export type ExternalProjectSyncSchema = {
  collections: ExternalProjectSyncCollectionSchema[];
  metadataFields?: ExternalProjectSyncField[];
  profileFields?: ExternalProjectSyncField[];
};

export type ExternalProjectSyncBlock = {
  blockType: string;
  content?: Record<string, unknown>;
  id?: string;
  sortOrder?: number;
  stableSourceId?: string | null;
  title?: string | null;
};

export type ExternalProjectSyncAsset = {
  altText?: string | null;
  assetType: string;
  blockStableSourceId?: string | null;
  id?: string;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  sourceUrl?: string | null;
  stableSourceId?: string | null;
  storagePath?: string | null;
};

export type ExternalProjectSyncEntryStatus = ExternalProjectEntryStatus;

export type ExternalProjectSyncEntry = {
  assets?: ExternalProjectSyncAsset[];
  blocks?: ExternalProjectSyncBlock[];
  collectionSlug: string;
  delete?: boolean;
  id?: string;
  metadata?: Record<string, unknown>;
  profileData?: Record<string, unknown>;
  publishedAt?: string | null;
  scheduledFor?: string | null;
  slug: string;
  stableSourceId?: string | null;
  status?: ExternalProjectSyncEntryStatus;
  subtitle?: string | null;
  summary?: string | null;
  title: string;
};

export type ExternalProjectSyncContent = {
  entries: ExternalProjectSyncEntry[];
};

export type ExternalProjectSyncManifest = {
  adapter: ExternalProjectAdapterKind;
  canonicalProjectId?: string | null;
  content: ExternalProjectSyncContent;
  schema: ExternalProjectSyncSchema;
  version: 1;
};

export type ExternalProjectSyncSnapshot = ExternalProjectSyncManifest & {
  canonicalProjectId: string | null;
  generatedAt: string;
  workspaceId: string;
};

export type ExternalProjectSyncEntity =
  | 'asset'
  | 'block'
  | 'collection'
  | 'entry'
  | 'schema';

export type ExternalProjectSyncAction =
  | 'archive'
  | 'create'
  | 'delete'
  | 'noop'
  | 'update';

export type ExternalProjectSyncOperation = {
  action: ExternalProjectSyncAction;
  after?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  destructive: boolean;
  entity: ExternalProjectSyncEntity;
  manifestKey: string;
  platformId?: string | null;
  reason: string;
};

export type ExternalProjectSyncDiff = {
  hasDestructiveOperations: boolean;
  operations: ExternalProjectSyncOperation[];
  summary: Record<ExternalProjectSyncAction, number>;
};

export type ExternalProjectSyncApplyResult = {
  applied: true;
  diff: ExternalProjectSyncDiff;
  snapshot: ExternalProjectSyncSnapshot;
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

export type WorkspaceDefaultPermissionMemberType =
  Database['public']['Enums']['workspace_member_type'];

export type WorkspaceDefaultPermissionsRole = {
  id: 'DEFAULT';
  member_type: WorkspaceDefaultPermissionMemberType;
  name: string;
  permissions: Array<{
    id: PermissionId;
    enabled: boolean;
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
export type WorkspaceCalendarGoogleTokenClient = Pick<
  WorkspaceCalendarGoogleToken,
  | 'account_email'
  | 'account_name'
  | 'created_at'
  | 'expires_at'
  | 'id'
  | 'is_active'
  | 'provider'
  | 'user_id'
  | 'ws_id'
>;
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
export type MeetStreamEvent = Tables<
  { schema: 'private' },
  'meet_stream_events'
>;
export type MeetStreamLiveInput = Tables<
  { schema: 'private' },
  'meet_stream_live_inputs'
>;

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
