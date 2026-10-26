import { siteConfig } from '../constants/configs';
import { fontPreloads } from './font-preloads';
import type { MailPageModel } from './page-model.server';
export function mailPageHead(model: MailPageModel) {
  const description =
    model.locale === 'vi'
      ? 'Đọc và gửi thư qua Gmail, Outlook và hộp thư Tuturuuu được quản lý.'
      : 'Read and send Gmail, Outlook, and managed Tuturuuu mailboxes.';
  return {
    meta: [
      { title: siteConfig.name },
      { name: 'description', content: description },
      { property: 'og:title', content: siteConfig.name },
      { property: 'og:description', content: description },
      { property: 'og:image', content: siteConfig.ogImage },
      { property: 'og:url', content: siteConfig.url },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: siteConfig.ogImage },
    ],
    links: fontPreloads(model.locale),
  };
}
