import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/** App-relative path (the router location, without the basePath). */
export const tasksPageInput = z.object({
  path: z
    .string()
    .max(8192)
    .refine((path) => path.startsWith('/') && !path.startsWith('//')),
});

export const loadTasksLocale = createServerFn({ method: 'GET' })
  .validator(tasksPageInput)
  .handler(async ({ data }) => {
    const { resolvePathLocale } = await import('./locale');
    return resolvePathLocale(data.path);
  });

export const loadTasksPage = createServerFn({ method: 'GET' })
  .validator(tasksPageInput)
  .handler(async ({ data }) => {
    const { loadPageModel } = await import('./page-model.server');
    return loadPageModel(data.path);
  });
