import { meetSeoToHeadMeta } from '@tuturuuu/meet-core/features/call/lib/seo/page-meta';
import type { MeetSeo } from '@tuturuuu/meet-core/features/call/lib/seo/metadata';
import { fontPreloads } from './font-preloads';
import { localeMessagesPreload } from './locale-messages';

export type MeetPageMeta = MeetSeo;

export function pageHead({
  meta,
  locale,
}: {
  meta: MeetPageMeta;
  locale: string;
}) {
  const head = meetSeoToHeadMeta(meta);
  return {
    meta: head.meta,
    links: [
      ...head.links,
      localeMessagesPreload(locale),
      ...fontPreloads(locale),
    ],
  };
}
