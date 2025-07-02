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
            'flex flex-col items-start gap-3 rounded-lg border p-4 text-left text-sm transition-all hover:bg-accent/50 focus:bg-accent/60 focus:outline-none cursor-pointer group relative',
            'hover:shadow-sm hover:border-accent/80',
            mail.selected === item.id &&
              'bg-accent/70 shadow-md border-accent ring-1 ring-accent/40'
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
                <span className="flex h-2.5 w-2.5 rounded-full bg-primary shadow-sm flex-shrink-0" />
              )}
            </div>

            <div className="flex w-full flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-sm text-foreground truncate">
                    {item.name}
                  </span>
                </div>
                <time className="text-xs text-muted-foreground whitespace-nowrap font-medium">
                  {dayjs(item.date).fromNow()}
                </time>
              </div>

              <div className="text-xs text-muted-foreground/80 font-medium">
                <span className="text-muted-foreground">{t('to_label')}</span>{' '}
                <span className="text-foreground/60">{item.recipient}</span>
              </div>

              <div className="font-medium line-clamp-2 text-sm text-foreground/80 leading-relaxed break-words group-hover:text-foreground/95 transition-colors">
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
            <span className="text-sm font-medium">
              {t('loading_more_emails')}
            </span>
          </div>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground font-medium">
          {t('no_more_emails')}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="text-4xl mb-4 opacity-20">📮</div>
          <p className="text-sm text-muted-foreground font-medium">
            {t('no_emails_found')}
          </p>
        </div>
      )}
    </div>
  );
}
