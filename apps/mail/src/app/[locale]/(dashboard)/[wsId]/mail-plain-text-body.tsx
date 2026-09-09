'use client';

import { useTranslations } from 'next-intl';
import { splitMailQuotedText } from './mail-quoted-history';

export function MailPlainTextBody({ content }: { content: string }) {
  const t = useTranslations('mail');
  const { authored, quoted } = splitMailQuotedText(content);
  return (
    <div className="px-4 pb-6 md:px-6">
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">
        {authored}
      </pre>
      {quoted ? (
        <details className="mt-3">
          <summary className="w-fit cursor-pointer rounded-md border px-2 py-1 text-muted-foreground text-xs hover:text-foreground">
            {t('quoted_text')}
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words border-l-2 pl-3 font-sans text-sm leading-7">
            {quoted}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
