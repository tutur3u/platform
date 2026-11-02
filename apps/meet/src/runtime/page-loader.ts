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
    const [{ loadPageModel }, { loadServerLocaleMessages }] =
      await observeMeetSsr('loader-import', () =>
        Promise.all([
          import('./page-model.server'),
          import('./locale-messages.server'),
        ])
      );
    const model = await observeMeetSsr('loader-model', () =>
      loadPageModel(data.path)
    );
    // Warm the locale chunk so the SSR render reads its messages without
    // suspending on the first request an isolate serves.
    await loadServerLocaleMessages(model.locale);
    return model;
  });
