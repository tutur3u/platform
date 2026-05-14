'use client';

import {
  Bot,
  Clock3,
  CloudMoon,
  Gauge,
  Grid3x3,
  Moon,
  Play,
  ServerCog,
  Sun,
  Sunrise,
  Sunset,
} from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { timeThemeOrder } from '@/engine/time-themes';
import type { HiveServer, HiveTimeTheme } from '@/engine/types';

type ToolDockSettingsPanelProps = {
  autoTimeEnabled: boolean;
  autoTimeSpeed: number;
  gaplessMode: boolean;
  isRunningSimulationTick: boolean;
  onSelectTimeTheme: (theme: HiveTimeTheme) => void;
  onSetAutoTimeSpeed: (speed: number) => void;
  onRunSimulationTick: () => void;
  onToggleAutoTime: () => void;
  onToggleGapless: () => void;
  onUpdateServerSettings: (
    settings: NonNullable<HiveServer['settings']>
  ) => void;
  server?: HiveServer | null;
  timeTheme: HiveTimeTheme;
};

const timeThemeIcons = {
  afternoon: Sun,
  evening: Sunset,
  midnight: Moon,
  morning: Sunrise,
  noon: Sun,
} satisfies Record<HiveTimeTheme, ComponentType<{ className?: string }>>;

export function ToolDockSettingsPanel(props: ToolDockSettingsPanelProps) {
  const t = useTranslations('studio.dock');
  const settings = props.server?.settings ?? {};

  return (
    <>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-1.5">
        <SettingsIconButton
          active={props.gaplessMode}
          icon={Grid3x3}
          label={t('gapless')}
          onClick={props.onToggleGapless}
        />
        <SettingsIconButton
          active={props.autoTimeEnabled}
          icon={Clock3}
          label={t('auto_time')}
          onClick={props.onToggleAutoTime}
        />
        <label
          aria-label={t('speed')}
          className="grid h-10 min-w-28 grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-border bg-background px-2 text-muted-foreground"
        >
          <Gauge className="h-4 w-4" />
          <input
            className="h-5 min-w-20 accent-[var(--dynamic-green)]"
            max={60}
            min={1}
            onChange={(event) =>
              props.onSetAutoTimeSpeed(Number(event.target.value))
            }
            type="range"
            value={props.autoTimeSpeed}
          />
        </label>
        {timeThemeOrder.map((theme) => (
          <SettingsIconButton
            active={props.timeTheme === theme}
            icon={timeThemeIcons[theme]}
            key={theme}
            label={t(`time_${theme}`)}
            onClick={() => props.onSelectTimeTheme(theme)}
          />
        ))}
        <SettingsIconButton
          active={!!settings.simulationCronEnabled}
          icon={ServerCog}
          label={t('cron')}
          onClick={() =>
            props.onUpdateServerSettings({
              simulationCronEnabled: !settings.simulationCronEnabled,
            })
          }
        />
        <SettingsIconButton
          active={!!settings.autonomousNpcEnabled}
          icon={Bot}
          label={t('autonomy')}
          onClick={() =>
            props.onUpdateServerSettings({
              autonomousNpcEnabled: !settings.autonomousNpcEnabled,
            })
          }
        />
        <SettingsIconButton
          disabled={props.isRunningSimulationTick}
          icon={Play}
          label={
            props.isRunningSimulationTick ? t('running_tick') : t('run_tick')
          }
          onClick={props.onRunSimulationTick}
        />
        <SettingsIconButton
          active={!!settings.ollamaEnabled}
          icon={CloudMoon}
          label={t('ollama')}
          onClick={() =>
            props.onUpdateServerSettings({
              llmProvider: settings.ollamaEnabled ? 'disabled' : 'ollama',
              ollamaEnabled: !settings.ollamaEnabled,
              ollamaModel: 'gemma4',
            })
          }
        />
      </div>
    </>
  );
}

function SettingsIconButton({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          className={[
            'inline-flex h-10 w-10 items-center justify-center rounded-md border transition disabled:cursor-wait disabled:opacity-60',
            active
              ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          ].join(' ')}
          disabled={disabled}
          onClick={onClick}
          type="button"
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
