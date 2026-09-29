/** Human-readable notification copy shared by all mobile push producers. */
export interface NotificationDisplayInput {
  type: string;
  title: string;
  description?: string | null;
  entity_type?: string | null;
  data?: Record<string, unknown> | null;
}

const APP_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['mail', 'Mail'],
  ['email', 'Mail'],
  ['task', 'Task'],
  ['deadline', 'Task'],
  ['calendar', 'Calendar'],
  ['event', 'Calendar'],
  ['finance', 'Finance'],
  ['wallet', 'Finance'],
  ['transaction', 'Finance'],
  ['invoice', 'Finance'],
  ['inventory', 'Inventory'],
  ['product', 'Inventory'],
  ['stock', 'Inventory'],
  ['checkout', 'Inventory'],
  ['note', 'Notes'],
  ['document', 'Documents'],
  ['chat', 'Chat'],
  ['meet', 'Meet'],
  ['drive', 'Drive'],
  ['file', 'Drive'],
  ['folder', 'Drive'],
  ['education', 'Education'],
  ['course', 'Education'],
  ['quiz', 'Education'],
  ['cms', 'CMS'],
  ['content', 'CMS'],
  ['crm', 'CRM'],
  ['contact', 'CRM'],
  ['habit', 'Habits'],
  ['timer', 'Timer'],
  ['time_tracking', 'Timer'],
  ['storefront', 'Storefront'],
  ['assistant', 'Assistant'],
  ['ai', 'Assistant'],
  ['workspace', 'Workspace'],
  ['member', 'Workspace'],
  ['security', 'Security'],
  ['mfa', 'Security'],
  ['login', 'Security'],
];

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function notificationAppName(input: NotificationDisplayInput): string {
  for (const source of [input.type, input.entity_type]) {
    const normalized = source?.toLowerCase() ?? '';
    const app = APP_PREFIXES.find(
      ([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}_`)
    );
    if (app) return app[1];
  }
  return 'Tuturuuu';
}

export function notificationDisplayCopy(input: NotificationDisplayInput): {
  app: string;
  title: string;
  body: string;
} {
  const app = notificationAppName(input);
  const rawTitle = nonEmpty(input.title) ?? app;
  const rawBody = nonEmpty(input.description);
  const taskName = app === 'Task' ? nonEmpty(input.data?.task_name) : null;
  const unprefixedTitle = rawTitle.toLowerCase().startsWith(`${app.toLowerCase()}:`)
    ? rawTitle.slice(app.length + 1).trim()
    : rawTitle;
  const itemName =
    taskName ??
    (app === 'Calendar'
      ? nonEmpty(input.data?.event_title) ?? nonEmpty(input.data?.event_name)
      : null) ??
    (app === 'Meet' ? nonEmpty(input.data?.meeting_title) : null) ??
    unprefixedTitle;
  const title = `${app}: ${itemName || rawTitle}`;
  const bodyParts = [
    ...(taskName && rawTitle !== taskName ? [rawTitle] : []),
    ...(rawBody && rawBody !== itemName ? [rawBody] : []),
  ];
  return { app, title, body: bodyParts.join(' · ') };
}
