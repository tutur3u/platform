'use client';

import { Bot, Check } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { HiveNpc } from '@/engine/types';

type HiveAgentRosterProps = {
  npcs: HiveNpc[];
  onSelectNpc: (npc: HiveNpc) => void;
  onToggleNpc: (npcId: string) => void;
  selectedIds: string[];
};

export function HiveAgentRoster({
  npcs,
  onSelectNpc,
  onToggleNpc,
  selectedIds,
}: HiveAgentRosterProps) {
  const t = useTranslations('studio.agents');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-xs">{t('agents')}</p>
        <span className="text-[11px] text-muted-foreground">
          {t('selected_count', { count: selectedIds.length })}
        </span>
      </div>
      <div className="space-y-1.5">
        {npcs.map((npc) => {
          const selected = selectedIds.includes(npc.id);

          return (
            <button
              className={[
                'flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left transition',
                selected
                  ? 'border-dynamic-green bg-dynamic-green/10'
                  : 'border-border bg-background hover:bg-muted/30',
              ].join(' ')}
              key={npc.id}
              onClick={() => {
                onToggleNpc(npc.id);
                onSelectNpc(npc);
              }}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Bot className="h-3.5 w-3.5 shrink-0 text-dynamic-blue" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-xs">
                    {npc.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {npc.role}
                  </span>
                </span>
              </span>
              {selected ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-dynamic-green" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
