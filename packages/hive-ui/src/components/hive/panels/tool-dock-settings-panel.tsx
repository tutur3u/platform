'use client';

import {
  Bot,
  Camera,
  Clock3,
  Cloud,
  CloudFog,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Gauge,
  Grid3x3,
  Play,
  ServerCog,
  Snowflake,
  Sprout,
  Sun,
  TreeDeciduous,
  Zap,
} from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import {
  hiveCameraViewOrder,
  hiveSeasonOrder,
  hiveWeatherOrder,
} from '../../../engine/environment';
import { formatSimulatedClock } from '../../../engine/time-themes';
import type {
  HiveCameraView,
  HiveSeason,
  HiveServer,
  HiveWeather,
} from '../../../engine/types';

type ToolDockSettingsPanelProps = {
  autoTimeEnabled: boolean;
  autoTimeSpeed: number;
  cameraView: HiveCameraView;
  gaplessMode: boolean;
  isRunningSimulationTick: boolean;
  onRunSimulationTick: () => void;
  onSelectCameraView: (view: HiveCameraView) => void;
  onSetAutoTimeSpeed: (speed: number) => void;
  onSetClockMinutes: (minutes: number) => void;
  onSetSeason: (season: HiveSeason) => void;
  onSetWeather: (weather: HiveWeather) => void;
  onToggleAutoTime: () => void;
  onToggleGapless: () => void;
  onUpdateServerSettings: (
    settings: NonNullable<HiveServer['settings']>
  ) => void;
  season: HiveSeason;
  server?: HiveServer | null;
  simulatedMinutes: number;
  weather: HiveWeather;
};

const seasonIcons = {
  autumn: TreeDeciduous,
  spring: Sprout,
  summer: Sun,
  winter: Snowflake,
} satisfies Record<HiveSeason, ComponentType<{ className?: string }>>;

const weatherIcons = {
  clear: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: Zap,
} satisfies Record<HiveWeather, ComponentType<{ className?: string }>>;

export function ToolDockSettingsPanel(props: ToolDockSettingsPanelProps) {
  const t = useTranslations('studio.dock');
  const settings = props.server?.settings ?? {};
  const clock = formatSimulatedClock(props.simulatedMinutes);

  return (
    <>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-1.5">
        <SettingsIconButton
          active={!props.gaplessMode}
          icon={Grid3x3}
          label={t('minimal_gaps')}
          onClick={props.onToggleGapless}
        />
        <SettingsIconButton
          active={props.autoTimeEnabled}
          icon={Clock3}
          label={t('auto_time')}
          onClick={props.onToggleAutoTime}
        />
        <label
          aria-label={t('time_of_day', { time: clock })}
          className="grid h-10 min-w-44 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-border bg-background px-2 text-muted-foreground"
        >
          <Clock3 className="h-4 w-4" />
          <input
            className="h-5 min-w-24 accent-[var(--dynamic-green)]"
            max={1439}
            min={0}
            onChange={(event) =>
              props.onSetClockMinutes(Number(event.target.value))
            }
            step={15}
            type="range"
            value={props.simulatedMinutes}
          />
          <span className="w-10 text-right font-medium text-foreground text-xs tabular-nums">
            {clock}
          </span>
        </label>
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
        {hiveSeasonOrder.map((season) => (
          <SettingsIconButton
            active={props.season === season}
            icon={seasonIcons[season]}
            key={season}
            label={t(`season_${season}`)}
            onClick={() => props.onSetSeason(season)}
          />
        ))}
        {hiveWeatherOrder.map((weather) => (
          <SettingsIconButton
            active={props.weather === weather}
            icon={weatherIcons[weather]}
            key={weather}
            label={t(`weather_${weather}`)}
            onClick={() => props.onSetWeather(weather)}
          />
        ))}
        {hiveCameraViewOrder.map((view) => (
          <SettingsIconButton
            active={props.cameraView === view}
            icon={Camera}
            key={view}
            label={t(`camera_${view}`)}
            onClick={() => props.onSelectCameraView(view)}
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
