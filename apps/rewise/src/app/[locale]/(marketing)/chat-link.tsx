import { createClient } from '@tuturuuu/supabase/next/client';
import { Button, buttonVariants } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Star, StarOff } from '@tuturuuu/ui/icons';
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
      <div className="flex items-center gap-2 group-hover:gap-2 md:gap-0">
        <Link
          target={link.newTab ? '_blank' : undefined}
          href={link.disabled ? '#' : link.forceRefresh ? '/new' : link.href}
          className={cn(
            buttonVariants({
              variant: 'ghost',
              size: isCollapsed ? 'icon' : 'sm',
            }),
            isCollapsed ? 'h-9 w-9' : 'w-full justify-start',
            'font-semibold whitespace-normal',
            isActive
              ? 'bg-linear-to-br from-dynamic-light-red/70 via-dynamic-light-pink/70 to-dynamic-light-blue/70 text-white hover:text-white'
              : urlToLoad === link.href
                ? 'animate-pulse bg-linear-to-br from-dynamic-light-red/30 via-dynamic-light-purple/30 to-dynamic-light-sky/30 text-accent-foreground'
                : 'bg-foreground/5 hover:bg-foreground/10',
            link.disabled &&
              link.showDisabled &&
              'cursor-not-allowed bg-transparent opacity-50 hover:bg-transparent'
          )}
          onClick={onClick}
        >
          {isCollapsed ? (
            link.icon
          ) : (
            <>
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
                    isActive && 'text-background dark:text-white'
                  )}
                >
                  {link.trailing}
                </span>
              )}
            </>
          )}
        </Link>
        {configs?.showFavorites && !single && (
          <Button
            size="xs"
            variant={loading ? 'secondary' : link.pinned ? 'ghost' : 'ghost'}
            className="opacity-0 transition-all duration-300 group-hover:w-8 group-hover:p-2 group-hover:opacity-100 md:w-0 md:p-0"
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
        <div className="flex items-center gap-2 group-hover:gap-2 md:gap-0">
          <Link
            target={link.newTab ? '_blank' : undefined}
            href={link.disabled ? '#' : link.forceRefresh ? '/new' : link.href}
            className={cn(
              buttonVariants({
                variant: 'ghost',
                size: isCollapsed ? 'icon' : 'sm',
              }),
              isCollapsed ? 'h-9 w-9' : 'w-full justify-start',
              'font-semibold whitespace-normal',
              isActive
                ? 'bg-linear-to-br from-dynamic-light-red/70 via-dynamic-light-pink/70 to-dynamic-light-blue/70 text-white hover:text-white'
                : urlToLoad === link.href
                  ? 'animate-pulse bg-linear-to-br from-dynamic-light-red/30 via-dynamic-light-purple/30 to-dynamic-light-sky/30 text-accent-foreground'
                  : 'bg-foreground/5 hover:bg-foreground/10',
              link.disabled &&
                link.showDisabled &&
                'cursor-not-allowed bg-transparent opacity-50 hover:bg-transparent'
            )}
            onClick={onClick}
          >
            {isCollapsed ? (
              link.icon
            ) : (
              <>
                {single && link.icon && (
                  <span className="mr-2">{link.icon}</span>
                )}
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
                      isActive && 'text-background dark:text-white'
                    )}
                  >
                    {link.trailing}
                  </span>
                )}
              </>
            )}
          </Link>
          {configs?.showFavorites && !single && (
            <Button
              size="xs"
              variant={loading ? 'secondary' : link.pinned ? 'ghost' : 'ghost'}
              className="opacity-0 transition-all duration-300 group-hover:w-8 group-hover:p-2 group-hover:opacity-100 md:w-0 md:p-0"
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
