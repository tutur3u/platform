import { Brain, Radio, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
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

  return (
    <div
      className={[
        'flex items-start justify-between gap-4',
        rightCollapsed ? '' : 'pr-[384px]',
      ].join(' ')}
    >
      <div className="pointer-events-auto text-foreground drop-shadow-sm">
        <h1 className="font-semibold text-2xl tracking-normal md:text-3xl">
          {t('title')}{' '}
          <span className="font-normal font-serif text-dynamic-yellow italic">
            {t('title_accent')}
          </span>
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">{t('hint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full border bg-background/72 px-2.5 py-1 backdrop-blur-md',
              connected
                ? 'border-dynamic-green/40 text-dynamic-green'
                : 'border-dynamic-yellow/40 text-dynamic-yellow',
            ].join(' ')}
          >
            <Radio className="h-3.5 w-3.5" />
            {connected ? t('realtime') : realtimeStatus}
          </span>
          <span className="rounded-full border border-border/60 bg-background/72 px-2.5 py-1 text-muted-foreground backdrop-blur-md">
            {world.blocks.length} {t('blocks')} / {world.objects.length}{' '}
            {t('objects')} / {npcs.length} {t('npcs')} / {presenceCount}{' '}
            {t('online')}
          </span>
        </div>
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
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/70 bg-background/78 p-2 shadow-foreground/10 shadow-xl backdrop-blur-xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('open_npc_lab')}
                className="h-10 w-10 rounded-full"
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
