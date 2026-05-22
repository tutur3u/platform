'use client';

import { Coins, User, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MindAiCreditSource } from './use-mind-ai-preferences';

function formatCredits(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.max(0, Math.round(value))}`;
}

function CreditLine({ wsId }: { wsId?: string }) {
  const { data } = useAiCredits(wsId);
  return (
    <span className="text-muted-foreground text-xs">
      {formatCredits(data?.remaining)}
    </span>
  );
}

export function MindCreditSourceSelector({
  creditSource,
  onCreditSourceChange,
  personalWsId,
  workspaceCreditLocked,
  wsId,
}: {
  creditSource: MindAiCreditSource;
  onCreditSourceChange: (source: MindAiCreditSource) => void;
  personalWsId?: string;
  workspaceCreditLocked?: boolean;
  wsId: string;
}) {
  const t = useTranslations('mind');
  const activeSource = workspaceCreditLocked ? 'personal' : creditSource;
  const Icon = activeSource === 'personal' ? User : Users;
  const activeCreditWsId =
    activeSource === 'personal' ? (personalWsId ?? 'personal') : wsId;
  const { data: activeCredits, isLoading } = useAiCredits(activeCreditWsId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 max-w-32 gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs"
          size="sm"
          type="button"
          variant="ghost"
        >
          <Coins className="h-3.5 w-3.5" />
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate">
            {isLoading ? '--' : formatCredits(activeCredits?.remaining)}
          </span>
          <span className="sr-only">{t('ai.creditSource')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          className={cn(
            'items-start gap-2',
            workspaceCreditLocked && 'opacity-50'
          )}
          disabled={workspaceCreditLocked}
          onSelect={() => onCreditSourceChange('workspace')}
        >
          <Users className="mt-0.5 h-3.5 w-3.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span>{t('ai.creditWorkspace')}</span>
              <CreditLine wsId={wsId} />
            </div>
            {workspaceCreditLocked ? (
              <p className="text-muted-foreground text-xs">
                {t('ai.creditWorkspaceLocked')}
              </p>
            ) : null}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="items-start gap-2"
          onSelect={() => onCreditSourceChange('personal')}
        >
          <User className="mt-0.5 h-3.5 w-3.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span>{t('ai.creditPersonal')}</span>
              <CreditLine wsId={personalWsId ?? 'personal'} />
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
