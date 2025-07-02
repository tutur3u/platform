import { Loader2 } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { Mail } from '../client';
import { useMail } from '../use-mail';

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

interface MailListProps {
  items: Mail[];
  hasMore?: boolean;
  loading?: boolean;
}

export function MailList({ items, hasMore, loading }: MailListProps) {
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
            <div className="flex items-center pt-1">
              {!item.read && (
                <span className="flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary shadow-sm" />
              )}
            </div>

            <div className="flex w-full min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-semibold text-foreground text-sm">
                    {item.name}
                  </span>
                </div>
                <time className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                  {dayjs(item.date).fromNow()}
                </time>
              </div>

              <div className="font-medium text-muted-foreground/80 text-xs">
                <span className="text-muted-foreground">{t('to_label')}</span>{' '}
                <span className="text-foreground/60">{item.recipient}</span>
              </div>

              <div className="line-clamp-2 break-words font-medium text-foreground/80 text-sm leading-relaxed transition-colors group-hover:text-foreground/95">
                {item.subject}
              </div>
            </div>
          </div>
        </button>
      ))}

      {loading && (
        <div className="flex items-center justify-center p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium text-sm">
              {t('loading_more_emails')}
            </span>
          </div>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex items-center justify-center p-6 font-medium text-muted-foreground text-sm">
          {t('no_more_emails')}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 text-4xl opacity-20">📮</div>
          <p className="font-medium text-muted-foreground text-sm">
            {t('no_emails_found')}
          </p>
        </div>
      )}
    </div>
  );
}
