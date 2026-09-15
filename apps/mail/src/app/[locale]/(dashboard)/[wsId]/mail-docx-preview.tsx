'use client';
import { useQuery } from '@tanstack/react-query';
import { getMailAttachmentDocx } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { validateMailDocx } from '@/lib/mail/docx-preview-validation';

export const MAIL_DOCX_FRAME = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:white;color:black}body{overflow-wrap:anywhere}.docx-wrapper{padding:12px!important}section.docx{max-width:100%;box-sizing:border-box}img{max-width:100%}</style></head><body></body></html>`;

export function MailDocxPreview({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const t = useTranslations('mail');
  const [document, setDocument] = useState<Document | null>(null);
  const [rendered, setRendered] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const query = useQuery({
    queryKey: ['mail', 'attachment-docx', url],
    queryFn: async ({ signal }) => {
      const bytes = await getMailAttachmentDocx(url, signal);
      await validateMailDocx(bytes, signal);
      return bytes;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!document || !query.data) return;
    let disposed = false;
    const preventNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventNavigation, true);
    document.addEventListener('auxclick', preventNavigation, true);
    setRendered(false);
    setRenderFailed(false);
    void import('docx-preview')
      .then(async ({ renderAsync }) => {
        if (disposed) return;
        const styles = document.createElement('div');
        const content = document.createElement('div');
        document.body.replaceChildren(styles, content);
        await renderAsync(query.data, content, styles, {
          useBase64URL: true,
          ignoreFonts: true,
          ignoreWidth: true,
          ignoreHeight: true,
          renderAltChunks: false,
          renderComments: false,
          experimental: false,
        });
        if (disposed) return;
        document.querySelectorAll('a').forEach((link) => {
          link.removeAttribute('href');
          link.removeAttribute('target');
        });
        setRendered(true);
      })
      .catch(() => {
        if (!disposed) setRenderFailed(true);
      });
    return () => {
      disposed = true;
      document.removeEventListener('click', preventNavigation, true);
      document.removeEventListener('auxclick', preventNavigation, true);
    };
  }, [document, query.data]);
  const failed = query.isError || renderFailed;
  return (
    <div className="relative min-h-40">
      {failed ? (
        <p className="p-6 text-muted-foreground text-sm">
          {t('attachment_preview_failed')}
        </p>
      ) : !rendered ? (
        <p role="status" className="p-6 text-muted-foreground text-sm">
          {t('loading')}
        </p>
      ) : null}
      <iframe
        title={t('preview_attachment', { filename })}
        srcDoc={MAIL_DOCX_FRAME}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        className={
          rendered && !failed
            ? 'h-[65dvh] w-full border-0'
            : 'invisible absolute h-0 w-full border-0'
        }
        onLoad={(event) => setDocument(event.currentTarget.contentDocument)}
      />
    </div>
  );
}
