import { useMail } from '../use-mail';
import type { InternalEmail } from '@tuturuuu/types/db';
import { Loader2 } from '@tuturuuu/ui/icons';
import { formatEmailAddresses } from '@tuturuuu/utils/email/client';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

interface MailListProps {
  items: InternalEmail[];
  hasMore?: boolean;
  loading?: boolean;
  confidentialMode?: boolean;
}

export function MailList({
  items,
  hasMore,
  loading,
  confidentialMode = false,
}: MailListProps) {
  const [mail, setMail] = useMail();
  const t = useTranslations('mail');
  const locale = useLocale();

  // Set dayjs locale
  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  return (
    <div className="flex flex-col gap-2 p-4 pt-2">
      {items.map((item) => (
        <button
          key={`mail-${item.id}`}
          type="button"
          className={cn(
            'group relative flex cursor-pointer flex-col items-start gap-3 rounded-lg border p-4 text-left text-sm transition-all hover:bg-accent/50 focus:bg-accent/60 focus:outline-none',
            'hover:border-accent/80 hover:shadow-sm',
            mail.selected === item.id &&
              'border-accent bg-accent/70 shadow-md ring-1 ring-accent/40'
          )}
          onClick={() =>
            setMail({
              ...mail,
              selected: item.id,
            })
          }
        >
          <div className="flex w-full items-start gap-3">
            {/* <div className="flex items-center pt-1">
              {!item.read && (
                <span className="flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary shadow-sm" />
              )}
            </div> */}

            <div className="flex w-full min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {confidentialMode
                      ? t('confidential_sender')
                      : formatEmailAddresses(item.source_email)
                          .map(({ name }) => name)
                          .join(', ')}
                  </span>
                </div>
                <time className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {dayjs(item.created_at).fromNow()}
                </time>
              </div>

              <div className="truncate text-xs font-medium text-muted-foreground/80">
                <span className="text-muted-foreground">{t('to_label')}</span>{' '}
                <span className="text-foreground/60">
                  {confidentialMode
                    ? t('confidential_recipients')
                    : formatEmailAddresses(item.to_addresses)
                        .map(({ email }) => email)
                        .join(', ')}
                </span>
              </div>

              <div className="line-clamp-2 text-sm leading-relaxed font-medium break-words text-foreground/80 transition-colors group-hover:text-foreground/95">
                {confidentialMode ? t('confidential_subject') : item.subject}
              </div>
            </div>
          </div>
        </button>
      ))}

      {loading && (
        <div className="flex items-center justify-center p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">
              {t('loading_more_emails')}
            </span>
          </div>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex items-center justify-center p-6 text-sm font-medium text-muted-foreground">
          {t('no_more_emails')}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 text-4xl opacity-20">📮</div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('no_emails_found')}
          </p>
        </div>
      )}
    </div>
  );
}
