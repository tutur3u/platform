import { Star, StarOff } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button, buttonVariants } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { NavLink } from '@/components/navigation';

export default function ChatLink({
  single,
  isActive,
  isCollapsed,
  link,
  urlToLoad,
  configs,
  onClick,
}: {
  single: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  link: NavLink;
  urlToLoad: string | undefined;
  configs?: {
    showChatName: boolean;
    showFavorites: boolean;
  };
  onClick?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  const handlePin = async () => {
    const chatId = link.href.split('/').pop();
    if (!chatId) return;

    setLoading(true);

    const { error } = await supabase
      .from('ai_chats')
      .update({ pinned: !link.pinned })
      .eq('id', chatId);

    if (error) {
      console.error('Error pinning chat:', error);
    } else {
      router.refresh();
    }

    setLoading(false);
  };

  if (!isCollapsed)
    return (
      <div className="group flex min-w-0 items-center gap-1">
        <Link
          target={link.newTab ? '_blank' : undefined}
          href={link.disabled ? '#' : link.forceRefresh ? '/new' : link.href}
          className={cn(
            buttonVariants({
              variant: 'ghost',
              size: 'sm',
            }),
            'h-9 min-w-0 flex-1 justify-start rounded-lg px-2.5',
            'whitespace-normal font-medium text-sm',
            isActive
              ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90'
              : urlToLoad === link.href
                ? 'animate-pulse bg-accent/60 text-accent-foreground'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
            link.disabled &&
              link.showDisabled &&
              'cursor-not-allowed bg-transparent opacity-50 hover:bg-transparent'
          )}
          onClick={onClick}
        >
          {single && link.icon && <span className="mr-2">{link.icon}</span>}
          <span
            className={cn(
              'line-clamp-1 break-all',
              !configs?.showChatName && 'opacity-50'
            )}
          >
            {configs?.showChatName
              ? link.title.replaceAll(/(\*\*)|(^")|("$)/g, '')
              : `${t('ai_chat.chat_name_hidden')}.`}
          </span>
          {configs?.showChatName && link.trailing && (
            <span
              className={cn(
                'ml-auto flex-none',
                isActive && 'text-accent-foreground'
              )}
            >
              {link.trailing}
            </span>
          )}
        </Link>
        {configs?.showFavorites && !single && (
          <Button
            size="xs"
            variant={loading ? 'secondary' : link.pinned ? 'ghost' : 'ghost'}
            className="size-8 shrink-0 p-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            onClick={handlePin}
            disabled={loading}
          >
            {loading ? (
              <div className="h-4 w-4">
                <LoadingIndicator />
              </div>
            ) : link.pinned ? (
              <StarOff className="h-4 w-4" />
            ) : (
              <Star className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    );

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="group flex items-center gap-1">
          <Link
            target={link.newTab ? '_blank' : undefined}
            href={link.disabled ? '#' : link.forceRefresh ? '/new' : link.href}
            className={cn(
              buttonVariants({
                variant: 'ghost',
                size: 'icon',
              }),
              'h-9 w-9',
              'whitespace-normal font-semibold',
              isActive
                ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90'
                : urlToLoad === link.href
                  ? 'animate-pulse bg-accent/60 text-accent-foreground'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
              link.disabled &&
                link.showDisabled &&
                'cursor-not-allowed bg-transparent opacity-50 hover:bg-transparent'
            )}
            onClick={onClick}
          >
            {link.icon}
          </Link>
          {configs?.showFavorites && !single && (
            <Button
              size="xs"
              variant={loading ? 'secondary' : link.pinned ? 'ghost' : 'ghost'}
              className="size-8 shrink-0 p-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={handlePin}
              disabled={loading}
            >
              {loading ? (
                <div className="h-4 w-4">
                  <LoadingIndicator />
                </div>
              ) : link.pinned ? (
                <StarOff className="h-4 w-4" />
              ) : (
                <Star className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className={cn(
          'flex items-center gap-4 border bg-background text-foreground'
        )}
      >
        {link.title}
      </TooltipContent>
    </Tooltip>
  );
}
