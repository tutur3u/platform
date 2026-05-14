import {
  Bot,
  Box,
  Brain,
  Layers3,
  Radio,
  UsersRound,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { HiveNpc, HiveUser, HiveWorldData } from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { HiveAccountMenu } from './panels/hive-account-menu';
import { NpcLabPanel } from './panels/npc-lab-panel';

type EditorTopChromeProps = {
  isRunningNpc: boolean;
  currentUser: HiveUser;
  npcLabCollapsed: boolean;
  npcs: HiveNpc[];
  onToggleNpcLab: () => void;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRunNpc: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => void;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  rightCollapsed: boolean;
  world: HiveWorldData;
};

export function EditorTopChrome({
  isRunningNpc,
  currentUser,
  npcLabCollapsed,
  npcs,
  onToggleNpcLab,
  onPatchNpc,
  onRunNpc,
  presenceCount,
  realtimeStatus,
  revision,
  rightCollapsed,
  world,
}: EditorTopChromeProps) {
  const t = useTranslations('studio.chrome');
  const connected = realtimeStatus === 'connected';
  const realtimeLabel = connected ? t('realtime') : realtimeStatus;

  return (
    <div
      className={[
        'flex items-start justify-between gap-3',
        rightCollapsed ? '' : 'pr-[384px]',
      ].join(' ')}
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-8rem)] flex-wrap items-center gap-1.5 text-xs drop-shadow-sm">
        <StatusChip
          active={connected}
          icon={Radio}
          label={t('realtime_status', { status: realtimeLabel })}
          value={realtimeLabel}
        />
        <StatusChip
          icon={Layers3}
          label={t('blocks_count', { count: world.blocks.length })}
          value={world.blocks.length.toLocaleString()}
        />
        <StatusChip
          icon={Box}
          label={t('objects_count', { count: world.objects.length })}
          value={world.objects.length.toLocaleString()}
        />
        <StatusChip
          icon={Bot}
          label={t('npcs_count', { count: npcs.length })}
          value={npcs.length.toLocaleString()}
        />
        <StatusChip
          icon={UsersRound}
          label={t('online_count', { count: presenceCount })}
          value={presenceCount.toLocaleString()}
        />
      </div>
      {npcLabCollapsed ? null : (
        <div className="pointer-events-auto relative">
          <button
            className="absolute -top-2 -right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg hover:text-foreground"
            onClick={onToggleNpcLab}
            title="Collapse NPC lab"
            type="button"
          >
            <span className="sr-only">Collapse NPC lab</span>
            <X className="h-3.5 w-3.5" />
          </button>
          <NpcLabPanel
            isRunning={isRunningNpc}
            npcs={npcs}
            onPatchNpc={onPatchNpc}
            onRun={onRunNpc}
            revision={revision}
            world={world}
          />
        </div>
      )}
      {npcLabCollapsed ? (
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/60 bg-background/78 p-1.5 shadow-foreground/10 shadow-xl backdrop-blur-xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('open_npc_lab')}
                className="h-9 w-9 rounded-md"
                onClick={onToggleNpcLab}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Brain className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('open_npc_lab')}</TooltipContent>
          </Tooltip>
          <HiveAccountMenu user={currentUser} variant="icon" />
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({
  active = false,
  icon: Icon,
  label,
  value,
}: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={[
            'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border bg-background/78 px-2.5 font-medium tabular-nums shadow-foreground/10 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl',
            active
              ? 'border-dynamic-green/45 text-dynamic-green'
              : 'border-border/70 text-muted-foreground',
          ].join(' ')}
          role="status"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
