import { AsyncLocalStorage } from 'node:async_hooks';

export const WEB_CRON_BATCH_LIMIT = 25;
export const WEB_CRON_MAX_PAGES = 20;
export const WEB_CRON_MAX_REMINDER_TASKS = 500;
export const WEB_CRON_MAX_REMINDER_RECIPIENTS = 1000;
const budget = new AsyncLocalStorage<{ pages: number }>();
export function withWebCronBudget<T>(handler: () => Promise<T>) {
  return budget.run({ pages: 0 }, handler);
}
export function hasWebCronBudget() {
  return budget.getStore() !== undefined;
}
export function chargeWebCronPage() {
  const current = budget.getStore();
  if (current && ++current.pages > WEB_CRON_MAX_PAGES)
    throw new Error('Cloudflare cron page budget exhausted');
}
export function assertReminderBudget(
  tasks: readonly { task_watchers: readonly unknown[] }[]
) {
  if (!hasWebCronBudget()) return;
  if (
    tasks.length > WEB_CRON_MAX_REMINDER_TASKS ||
    tasks.reduce((sum, task) => sum + task.task_watchers.length, 0) >
      WEB_CRON_MAX_REMINDER_RECIPIENTS
  )
    throw new Error('Cloudflare reminder batch exceeds its recipient budget');
}
