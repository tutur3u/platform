export const PROXY_ONLY_PUBLIC_TABLES = [
  'ai_gateway_models',
  'ai_whitelisted_domains',
  'form_questions',
  'form_response_answers',
  'form_sections',
  'forms',
  'healthcare_diagnoses',
  'healthcare_vital_groups',
  'mira_accessories',
  'mira_achievements',
  'notification_batches',
  'notification_delivery_log',
  'nova_challenge_criteria',
  'nova_challenges',
  'nova_problem_test_cases',
  'nova_problems',
  'nova_submission_test_cases',
  'nova_teams',
  'personal_notes',
  'recording_transcripts',
  'time_tracking_request_activity',
  'time_tracking_request_comments',
  'time_tracking_requests',
  'timezones',
  'workspace_calendar_sync_log',
  'workspace_calendars',
  'workspace_credit_packs',
  'workspace_debt_loans',
  'workspace_education_access_requests',
  'workspace_scheduling_metadata',
  'workspace_subscription_errors',
  'workspace_subscription_products',
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
