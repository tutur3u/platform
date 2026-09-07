import { sanitizeMailHtml } from '@/lib/mail/html';

export type MailMessagePreviewMode = 'dark' | 'original';

export function buildMailMessagePreviewDocument(
  content: string,
  mode: MailMessagePreviewMode,
  inlineImages: Record<string, string> = {}
) {
  const darkStyles =
    mode === 'dark'
      ? 'html,body{color-scheme:dark;background:#121212;color:#e7e7e7}'
      : 'html,body{color-scheme:light;background:#fff;color:#171717}';

  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: cid:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${mode === 'dark' ? 'dark' : 'light'}"><style>*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:auto}body{padding:0;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;word-break:break-word}img,video,svg,canvas{max-width:100%!important;height:auto!important}table{max-width:100%!important;table-layout:auto}pre{max-width:100%;white-space:pre-wrap;word-break:break-word}blockquote{margin-inline:0;padding-inline-start:12px;border-inline-start:3px solid #737373}${darkStyles}</style></head><body>${sanitizeMailHtml(content, { isolatedDocument: true, inlineImages })}</body></html>`;
}
