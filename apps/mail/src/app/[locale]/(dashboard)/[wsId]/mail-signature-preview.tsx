'use client';

import { sanitizeMailHtml, textToHtml } from '@/lib/mail/html';

export function MailSignaturePreview({
  emptyLabel,
  html,
  text,
  title,
}: {
  emptyLabel: string;
  html: string;
  text: string;
  title: string;
}) {
  const content = html.trim() || (text.trim() ? textToHtml(text) : '');

  if (!content) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dynamic border-dashed bg-foreground/[0.02] px-6 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <iframe
      className="min-h-40 w-full rounded-xl border border-dynamic bg-white"
      sandbox=""
      srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>body{box-sizing:border-box;margin:0;padding:16px;color:#171717;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#2563eb}</style></head><body>${sanitizeMailHtml(content)}</body></html>`}
      title={title}
    />
  );
}
