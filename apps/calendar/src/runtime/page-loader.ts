import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const calendarPageInput = z.object({
  path: z
    .string()
    .max(8192)
    .refine((path) => path.startsWith('/') && !path.startsWith('//')),
});

export const loadCalendarLocale = createServerFn({ method: 'GET' })
  .validator(calendarPageInput)
  .handler(async ({ data }) => {
    const { loadLocaleContext } = await import('./locale-context.server');
    return loadLocaleContext(data.path);
  });

export const loadCalendarPage = createServerFn({ method: 'GET' })
  .validator(calendarPageInput)
  .handler(async ({ data }) => {
    const { loadPageModel } = await import('./page-model.server');
    return loadPageModel(data.path);
  });
