import LoadingIndicator from '@/components/common/LoadingIndicator';
import { NavLink } from '@/components/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { Button, buttonVariants } from '@repo/ui/components/ui/button';
import { Star, StarOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

  return (
    <div className="flex items-center gap-2 group-hover:gap-2 md:gap-0">
      <Link
        href={
          link.disabled
            ? '#'
            : link.forceRefresh
              ? `${link.href}?refresh=true`
              : link.href
        }
        className={cn(
          buttonVariants({
            variant: 'ghost',
            size: isCollapsed ? 'icon' : 'sm',
          }),
          isCollapsed ? 'h-9 w-9' : 'w-full justify-start',
          'whitespace-normal',
          isActive
            ? 'from-dynamic-red/20 via-dynamic-purple/20 to-dynamic-sky/20 hover:from-dynamic-red/20 hover:via-dynamic-purple/20 hover:to-dynamic-sky/20 bg-gradient-to-br'
            : urlToLoad === link.href
              ? 'from-dynamic-red/30 via-dynamic-purple/30 to-dynamic-sky/30 text-accent-foreground animate-pulse bg-gradient-to-br'
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
          className="transition-all duration-300 group-hover:w-auto group-hover:p-2 md:w-0 md:p-0"
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
}