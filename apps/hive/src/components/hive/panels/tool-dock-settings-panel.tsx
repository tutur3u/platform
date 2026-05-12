'use client';

import { Grid3x3 } from '@tuturuuu/icons';
import { timeThemeLabels, timeThemeOrder } from '@/engine/time-themes';
import type { HiveTimeTheme } from '@/engine/types';

type ToolDockSettingsPanelProps = {
  autoTimeEnabled: boolean;
  autoTimeSpeed: number;
  gaplessMode: boolean;
  onSelectTimeTheme: (theme: HiveTimeTheme) => void;
  onSetAutoTimeSpeed: (speed: number) => void;
  onToggleAutoTime: () => void;
  onToggleGapless: () => void;
  timeTheme: HiveTimeTheme;
};

export function ToolDockSettingsPanel(props: ToolDockSettingsPanelProps) {
  return (
    <>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-1.5">
        <button
          aria-pressed={props.gaplessMode}
          className={[
            'grid h-14 min-w-18 place-items-center rounded-lg border px-3 text-[11px] transition',
            props.gaplessMode
              ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          ].join(' ')}
          onClick={props.onToggleGapless}
          title="Toggle gapless blocks"
          type="button"
        >
          <Grid3x3 className="h-4 w-4" />
          <span className="mt-1 leading-none">Gapless</span>
        </button>
        <button
          aria-pressed={props.autoTimeEnabled}
          className={[
            'h-14 min-w-20 rounded-lg border px-3 text-[11px] transition',
            props.autoTimeEnabled
              ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          ].join(' ')}
          onClick={props.onToggleAutoTime}
          title="Toggle automatic 24 hour cycle"
          type="button"
        >
          <span className="block leading-none">Auto 24h</span>
        </button>
        <label className="grid h-14 min-w-28 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
          <span className="leading-none">Speed</span>
          <input
            className="mt-1 h-5 accent-[var(--dynamic-green)]"
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
          <button
            aria-pressed={props.timeTheme === theme}
            className={[
              'h-14 min-w-20 rounded-lg border px-3 text-[11px] transition',
              props.timeTheme === theme
                ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
            ].join(' ')}
            key={theme}
            onClick={() => props.onSelectTimeTheme(theme)}
            title={`${timeThemeLabels[theme]} theme`}
            type="button"
          >
            <span className="block leading-none">{timeThemeLabels[theme]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
