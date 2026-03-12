export const PROXY_ONLY_PUBLIC_TABLES = [
  'ai_chat_messages',
  'ai_gateway_models',
  'ai_whitelisted_domains',
  'board_templates',
  'calendar_sync_dashboard',
  'crawled_urls',
  'email_audit',
  'external_user_monthly_report_logs',
  'external_user_monthly_reports',
  'finance_budgets',
  'finance_invoice_promotions',
  'form_questions',
  'form_response_answers',
  'form_sections',
  'forms',
  'healthcare_diagnoses',
  'healthcare_vital_groups',
  'meet_together_plans',
  'mira_accessories',
  'mira_achievements',
  'notification_batches',
  'notification_delivery_log',
  'notifications',
  'nova_challenge_criteria',
  'nova_challenges',
  'nova_problem_test_cases',
  'nova_problems',
  'nova_submission_test_cases',
  'nova_submissions',
  'nova_teams',
  'personal_notes',
  'recording_transcripts',
  'recurring_transactions',
  'sent_emails',
  'support_inquiries',
  'task_board_status_templates',
  'task_cycles',
  'task_drafts',
  'task_initiatives',
  'task_project_update_comments',
  'task_project_updates',
  'task_projects',
  'tasks',
  'time_tracking_categories',
  'time_tracking_request_activity',
  'time_tracking_request_comments',
  'time_tracking_requests',
  'time_tracking_sessions',
  'timezones',
  'transaction_tags',
  'user_feedbacks',
  'user_group_post_logs',
  'user_group_posts',
  'wallet_transactions',
  'workspace_ai_executions',
  'workspace_ai_models',
  'workspace_ai_prompts',
  'workspace_api_key_usage_logs',
  'workspace_api_keys',
  'workspace_break_types',
  'workspace_calendar_events',
  'workspace_calendar_sync_log',
  'workspace_calendars',
  'workspace_chat_channels',
  'workspace_chat_messages',
  'workspace_courses',
  'workspace_credit_packs',
  'workspace_dataset_cells',
  'workspace_dataset_columns',
  'workspace_datasets',
  'workspace_debt_loans',
  'workspace_documents',
  'workspace_education_access_requests',
  'workspace_habits',
  'workspace_products',
  'workspace_promotions',
  'workspace_scheduling_metadata',
  'workspace_subscription_errors',
  'workspace_subscription_products',
  'workspace_user_fields',
  'workspace_wallets',
  'workspace_whiteboards',
] as const;

const proxyOnlyPublicTableSet = new Set<string>(PROXY_ONLY_PUBLIC_TABLES);

type TableAwareClient = {
  from: (table: string) => unknown;
  schema?: (...args: any[]) => unknown;
};

export const isProxyOnlyPublicTable = (table: string): boolean =>
  proxyOnlyPublicTableSet.has(table);

export const getProxyOnlyPublicTableError = (table: string): Error =>
  new Error(
    `Direct Supabase access to public.${table} is disabled. Route this CRUD through apps/web API endpoints so proxy protections apply.`
  );

export const wrapDirectClientForProxyOnlyTables = <T extends TableAwareClient>(
  client: T
): T =>
  new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'from') {
        return (table: string) => {
          if (isProxyOnlyPublicTable(table)) {
            throw getProxyOnlyPublicTableError(table);
          }

          return target.from(table);
        };
      }

      if (property === 'schema') {
        const schema = Reflect.get(target, property, receiver);

        if (typeof schema !== 'function') {
          return schema;
        }

        return (schemaName: string) => {
          const schemaClient = schema.call(target, schemaName);

          if (
            schemaName !== 'public' ||
            !schemaClient ||
            typeof schemaClient !== 'object'
          ) {
            return schemaClient;
          }

          return wrapDirectClientForProxyOnlyTables(
            schemaClient as TableAwareClient
          );
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });

export const wrapRequestClientForProxyOnlyTables = <
  TUserClient extends TableAwareClient,
  TAdminClient extends TableAwareClient,
>(
  userClient: TUserClient,
  adminClient: TAdminClient
): TUserClient =>
  new Proxy(userClient, {
    get(target, property, receiver) {
      if (property === 'from') {
        return (table: string) => {
          const delegatedClient = isProxyOnlyPublicTable(table)
            ? adminClient
            : target;

          return delegatedClient.from(table);
        };
      }

      if (property === 'schema') {
        const userSchema = Reflect.get(target, property, receiver);
        const adminSchema = Reflect.get(adminClient, property);

        if (typeof userSchema !== 'function') {
          return userSchema;
        }

        return (schemaName: string) => {
          const userSchemaClient = userSchema.call(target, schemaName);

          if (
            schemaName !== 'public' ||
            !userSchemaClient ||
            typeof userSchemaClient !== 'object'
          ) {
            return userSchemaClient;
          }

          const adminSchemaClient =
            typeof adminSchema === 'function'
              ? adminSchema.call(adminClient, schemaName)
              : adminClient;

          return wrapRequestClientForProxyOnlyTables(
            userSchemaClient as TableAwareClient,
            adminSchemaClient as TableAwareClient
          );
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
