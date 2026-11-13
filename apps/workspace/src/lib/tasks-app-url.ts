import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getTasksAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'tasks',
    candidates: [
      process.env.TASKS_APP_URL,
      process.env.NEXT_PUBLIC_TASKS_APP_URL,
      process.env.TUTURUUU_TASKS_BASE_URL,
      process.env.TUDO_APP_URL,
      process.env.NEXT_PUBLIC_TUDO_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://tasks.tuturuuu.com'
        : getLocalInternalAppUrl('tasks', 'http://localhost:7809'),
  });
}
