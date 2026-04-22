'use client';

import { Grid3X3, Rows3 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useTransition } from 'react';

interface ViewToggleProps {
  currentView: 'card' | 'table';
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const t = useTranslations('ws-courses');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleViewChange = useCallback(
    (view: 'card' | 'table') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', view);
      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  return (
    <div className="inline-flex rounded-2xl border border-border/70 bg-background/85 p-1 shadow-sm backdrop-blur-sm">
      {(
        [
          { key: 'card', label: t('card_view'), Icon: Grid3X3 },
          { key: 'table', label: t('table_view'), Icon: Rows3 },
        ] as const
      ).map(({ key, label, Icon }) => {
        const isActive = currentView === key;

        return (
          <Button
            key={key}
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            aria-pressed={isActive}
            onClick={() => handleViewChange(key)}
            className={cn(
              'h-10 rounded-xl border border-transparent px-3.5 text-foreground/70 shadow-none transition-all hover:bg-transparent hover:text-foreground',
              isActive &&
                'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue shadow-sm hover:bg-dynamic-blue/10 hover:text-dynamic-blue'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
