// These namespaces are only consumed below the authenticated dashboard route
// group. Keeping them out of the root provider prevents every public page from
// serializing dashboard-only translations into its HTML/RSC payload.
export const DASHBOARD_ONLY_MESSAGE_NAMESPACES = [
  'ai-credits-admin',
  'ai-execution-charts',
  'blue-green-monitoring',
  'link-shortener',
  'meet-together-plan-details',
  'mobile-deployment-settings',
  'rate-limits',
  'task-progress',
  'ws-api-keys',
  'ws-board-templates',
  'ws-debt-loan',
  'ws-invoices',
  'ws-overview',
  'ws-reports',
  'ws-roles',
  'ws-storage-objects',
  'ws-tasks',
  'ws-topic-announcements',
  'ws-user-group-schedule',
  'ws-users',
] as const;

const dashboardOnlyNamespaces = new Set<string>(
  DASHBOARD_ONLY_MESSAGE_NAMESPACES
);

export function getPublicClientMessages<T extends Record<string, unknown>>(
  messages: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(messages).filter(
      ([namespace]) => !dashboardOnlyNamespaces.has(namespace)
    )
  ) as Partial<T>;
}
