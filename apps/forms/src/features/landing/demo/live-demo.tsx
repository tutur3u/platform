'use client';

import { Check, Palette } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import { FormRuntime } from '@/features/forms/form-runtime';
import type { FormThemeInput } from '@/features/forms/schema';
import {
  FORM_ACCENT_BADGE_CLASSES,
  getThemePreset,
} from '@/features/forms/theme';
import { buildDemoForm, type DemoFormCopy } from './demo-form';

/** Presets offered on the landing, in the order they read best left to right. */
const SHOWCASE_PRESET_IDS = [
  'editorial-moss',
  'velvet-signal',
  'coastal-notes',
  'signal-coral',
  'night-ledger',
  'rose-ritual',
] as const;

const BASE_THEME = {
  density: 'balanced',
  coverHeadline: '',
  coverImage: { storagePath: '', url: '', alt: '' },
  sectionImages: {},
  typography: { displaySize: 'md', headingSize: 'md', bodySize: 'md' },
} satisfies Omit<
  FormThemeInput,
  'presetId' | 'accentColor' | 'headlineFontId' | 'bodyFontId' | 'surfaceStyle'
>;

function themeForPreset(presetId: string): FormThemeInput {
  const preset = getThemePreset(presetId);

  return {
    ...BASE_THEME,
    presetId: preset.id,
    accentColor: preset.accentColor,
    headlineFontId: preset.headlineFontId,
    bodyFontId: preset.bodyFontId,
    surfaceStyle: preset.surfaceStyle,
  };
}

interface LiveDemoProps {
  copy: DemoFormCopy;
  /** Label for the theme switcher rail, e.g. "Try a theme". */
  themeLabel: string;
  className?: string;
}

/**
 * Interactive product demo.
 *
 * Switching a preset rebuilds the definition and remounts the runtime through
 * a keyed subtree. Remounting is deliberate: a theme change also changes the
 * confirmation screen and font metrics, and a visitor who already submitted the
 * demo should be dropped back at the top of a freshly themed form rather than
 * left staring at a "thanks" card in a new colour.
 */
export function LiveDemo({ copy, themeLabel, className }: LiveDemoProps) {
  const [presetId, setPresetId] = useState<string>(SHOWCASE_PRESET_IDS[0]);

  const presets = useMemo(
    () => SHOWCASE_PRESET_IDS.map((id) => getThemePreset(id)),
    []
  );
  const form = useMemo(
    () => buildDemoForm(copy, themeForPreset(presetId)),
    [copy, presetId]
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.18em]">
          <Palette className="h-3.5 w-3.5" />
          {themeLabel}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => {
            const active = preset.id === presetId;

            return (
              <button
                aria-pressed={active}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-foreground/25 bg-foreground/[0.06] text-foreground'
                    : 'border-foreground/10 text-foreground/55 hover:border-foreground/20 hover:text-foreground'
                )}
                key={preset.id}
                onClick={() => setPresetId(preset.id)}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    FORM_ACCENT_BADGE_CLASSES[preset.accentColor]
                  )}
                />
                {preset.name}
                {active ? <Check className="h-3 w-3" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-foreground/[0.08] bg-background/60 shadow-2xl shadow-foreground/[0.06] backdrop-blur-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_22%,transparent),transparent)]"
        />
        {/* Grows with the question rather than scrolling inside a fixed box.
            The runtime is `inline` here, so it no longer claims a viewport —
            a 34rem scroller around content that is usually one short question
            produced a pane of empty space with its own scrollbar, and reading
            the demo meant scrolling a second time inside the page. The floor
            keeps the frame from snapping between question heights. */}
        <div className="min-h-[26rem] p-3 sm:p-5">
          <FormRuntime
            form={form}
            key={presetId}
            layout="inline"
            mode="preview"
          />
        </div>
      </div>
    </div>
  );
}
