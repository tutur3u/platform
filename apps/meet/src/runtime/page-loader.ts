import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const loadMeetPage = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      path: z
        .string()
        .max(8192)
        .refine((path) => path.startsWith('/') && !path.startsWith('//')),
    })
  )
  .handler(async ({ data }) => {
    const { loadPageModel } = await import('./page-model.server');
    return loadPageModel(data.path);
  });
