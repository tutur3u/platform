import { Loader2 } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { formatDistanceToNow } from 'date-fns';
import type { Mail } from '../client';
import { useMail } from '../use-mail';

interface MailListProps {
  items: Mail[];
  hasMore?: boolean;
  loading?: boolean;
}

export function MailList({ items, hasMore, loading }: MailListProps) {
  const [mail, setMail] = useMail();

  return (
    <div className="flex flex-col gap-2 p-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            'flex flex-col items-start gap-2.5 rounded-md border p-3 text-left text-sm transition-all hover:bg-accent/60 focus:bg-accent/60 focus:outline-none  cursor-pointer group',
            mail.selected === item.id && 'bg-accent/80 shadow-sm '
          )}
          onClick={() =>
            setMail({
              ...mail,
              selected: item.id,
            })
          }
        >
          <div className="grid grid-cols-[25px_1fr] items-start w-full gap-3">
            <div className="flex items-center gap-2 pt-0.5">
              {!item.read && (
                <span className="flex h-2 w-2 rounded-full bg-primary flex-shrink-0" />
              )}
            </div>

            <div className="flex w-full flex-col gap-1.5 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">
                    {item.name}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(item.date), {
                    addSuffix: true,
                  })}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                To: {item.recipient}
              </div>

              <div className="font-medium line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed break-words group-hover:text-foreground/90">
                {item.subject}
              </div>
            </div>
          </div>
        </button>
      ))}

      {loading && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading more emails...
          </span>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          No more emails to load
        </div>
      )}
    </div>
  );
}
