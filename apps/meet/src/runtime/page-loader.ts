import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { observeMeetSsr } from './ssr-diagnostics';

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
    const { loadPageModel } = await observeMeetSsr(
      'loader-import',
      () => import('./page-model.server')
    );
    return observeMeetSsr('loader-model', () => loadPageModel(data.path));
  });
