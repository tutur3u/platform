'use client';

import { Bot, Hash, MessageCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type Scope = 'personal' | 'workspaces';

const scopes: {
  icon: ReactNode;
  id: Scope;
  subtitleKey: 'scope_personal_subtitle' | 'scope_workspaces_subtitle';
  titleKey: 'scope_personal' | 'scope_workspaces';
}[] = [
  {
    icon: <MessageCircle className="size-4" />,
    id: 'personal',
    subtitleKey: 'scope_personal_subtitle',
    titleKey: 'scope_personal',
  },
  {
    icon: (
      <span className="flex items-center gap-0.5">
        <Hash className="size-4" />
        <Bot className="size-3.5" />
      </span>
    ),
    id: 'workspaces',
    subtitleKey: 'scope_workspaces_subtitle',
    titleKey: 'scope_workspaces',
  },
];

export function ChatScopeTabs() {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeScope =
    searchParams.get('scope') === 'workspaces' ? 'workspaces' : 'personal';

  function setScope(scope: Scope) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('scope', scope);
    nextParams.delete('conversationId');
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border bg-muted/30 p-0.5">
      {scopes.map((scope) => {
        const active = activeScope === scope.id;

        return (
          <Button
            aria-label={`${t(scope.titleKey)} (${t(scope.subtitleKey)})`}
            className={cn(
              'h-9 min-w-0 rounded-sm px-2 text-sm transition-[background-color,color,flex-basis,width]',
              active ? 'flex-1 justify-start gap-2' : 'w-9 flex-none px-0',
              active
                ? 'bg-background text-foreground shadow-xs'
                : 'bg-transparent text-muted-foreground hover:bg-background/60'
            )}
            key={scope.id}
            onClick={() => setScope(scope.id)}
            size="sm"
            title={`${t(scope.titleKey)} (${t(scope.subtitleKey)})`}
            type="button"
            variant="ghost"
          >
            {scope.icon}
            <span className={cn('truncate', !active && 'sr-only')}>
              {t(scope.titleKey)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function useChatScope() {
  const searchParams = useSearchParams();
  return searchParams.get('scope') === 'workspaces' ? 'workspaces' : 'personal';
}
