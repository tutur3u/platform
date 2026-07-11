import { sanitizeMailHtml } from '@/lib/mail/html';

export type MailMessagePreviewMode = 'dark' | 'original';

export function buildMailMessagePreviewDocument(
  content: string,
  mode: MailMessagePreviewMode
) {
  const darkStyles =
    mode === 'dark'
      ? 'html,body{color-scheme:dark;background:#121212;color:#e7e7e7}body *{background-color:transparent!important;color:inherit!important;border-color:#3f3f46!important}a{color:#7dd3fc!important}'
      : 'html,body{color-scheme:light;background:#fff;color:#171717}';

  return `<!doctype html><html><head><meta name="color-scheme" content="${mode === 'dark' ? 'dark' : 'light'}"><style>*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden}body{padding:16px;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;word-break:break-word}img,video,svg,canvas{max-width:100%!important;height:auto!important}table{max-width:100%!important;table-layout:fixed}pre{max-width:100%;white-space:pre-wrap;word-break:break-word}blockquote{margin-inline:0;padding-inline-start:12px;border-inline-start:3px solid #737373}${darkStyles}</style></head><body>${sanitizeMailHtml(content)}</body></html>`;
}
