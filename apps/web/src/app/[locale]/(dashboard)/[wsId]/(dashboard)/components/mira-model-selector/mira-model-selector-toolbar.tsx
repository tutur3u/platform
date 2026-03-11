'use client';

import { ArrowBigUpDash, Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface MiraModelSelectorToolbarProps {
  hideLockedModels: boolean;
  onHideLockedModelsChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  search: string;
  showUpgradeCta: boolean;
  wsId: string;
}

export function MiraModelSelectorToolbar({
  hideLockedModels,
  onHideLockedModelsChange,
  onSearchChange,
  search,
  showUpgradeCta,
  wsId,
}: MiraModelSelectorToolbarProps) {
  const t = useTranslations('dashboard.mira_chat');

  return (
    <>
      {showUpgradeCta ? (
        <div className="m-2 mb-0 rounded-xl border border-dynamic-primary/25 bg-linear-to-r from-dynamic-primary/20 via-dynamic-secondary/15 to-dynamic-purple/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm">
                {t('model_unlock_more_title')}
              </p>
              <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                {t('model_unlock_more_description')}
              </p>
            </div>
            <Link
              href={`/${wsId}/billing`}
              className={cn(
                'group flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dynamic-purple/20',
                'bg-linear-to-r from-dynamic-purple/10 to-dynamic-indigo/8 px-3 font-medium text-dynamic-purple text-sm',
                'transition-all duration-200 hover:border-dynamic-purple/35',
                'hover:[box-shadow:0_0_20px_-5px_oklch(var(--dynamic-purple)/0.3)]'
              )}
            >
              <ArrowBigUpDash className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              {t('model_upgrade_cta')}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder={t('model_selector_search')}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full bg-background/50 py-1.5 pr-3 pl-9 text-foreground text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            {t('model_hide_locked')}
          </span>
          <Switch
            checked={hideLockedModels}
            onCheckedChange={onHideLockedModelsChange}
            aria-label={t('model_hide_locked')}
          />
        </div>
      </div>
    </>
  );
}
