'use client';

import { Monitor, RotateCcw, Smartphone, Tablet } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { FormRuntime } from '../form-runtime';
import type { getFormToneClasses } from '../theme';
import type { FormDefinition } from '../types';

type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

/**
 * Widths chosen to match where forms are actually filled in, not to be round
 * numbers: 390px is an iPhone 15/16, 834px an iPad in portrait.
 */
/**
 * The same floor the embed SDK applies, for the same reason: a short form
 * should not collapse the frame to a sliver. Kept in step deliberately — a
 * preview that can be shorter than the embed shows authors a layout their
 * respondents will never see.
 */
const PREVIEW_MIN_HEIGHT = 320;

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
};

const DEVICES: Array<{
  id: PreviewDevice;
  icon: typeof Monitor;
  labelKey: string;
}> = [
  { id: 'desktop', icon: Monitor, labelKey: 'studio.preview_desktop' },
  { id: 'tablet', icon: Tablet, labelKey: 'studio.preview_tablet' },
  { id: 'mobile', icon: Smartphone, labelKey: 'studio.preview_mobile' },
];

/**
 * The preview tab: the real runtime, at a chosen width, restartable.
 *
 * Width matters more than it used to. Most forms are answered on a phone, and
 * a preview that only ever shows the desktop layout hides exactly the problems
 * worth catching — a question title that wraps to four lines, options that
 * stop being tappable, a progress bar that crowds the question.
 *
 * Restart matters more too. One question at a time means walking a form to its
 * end, and before this the only way back to the first question was leaving the
 * tab and returning.
 */
export function PreviewPanel({
  form,
  toneClasses,
  t,
}: {
  form: FormDefinition;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [runId, setRunId] = useState(0);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1">
          <legend className="sr-only">{t('studio.preview_width')}</legend>
          {DEVICES.map(({ id, icon: Icon, labelKey }) => (
            <Button
              key={id}
              aria-pressed={device === id}
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setDevice(id)}
              size="sm"
              type="button"
              variant={device === id ? 'secondary' : 'ghost'}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey)}
            </Button>
          ))}
        </fieldset>

        <Button
          className="h-7 gap-1.5 rounded-full px-3 text-xs"
          // Remounting is the restart: the runtime holds the respondent's
          // position and answers in its own state, so a new key is the only
          // way back to a genuinely blank first question.
          onClick={() => setRunId((current) => current + 1)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('studio.preview_restart')}
        </Button>
      </div>

      <div className="flex min-w-0 justify-center">
        <div
          className={cn(
            'min-w-0 transition-[max-width] duration-300 ease-out',
            device === 'desktop' ? 'w-full' : 'w-full'
          )}
          style={{
            maxWidth: DEVICE_WIDTH[device],
            minHeight: `${PREVIEW_MIN_HEIGHT}px`,
          }}
        >
          <FormRuntime
            className={cn('rounded-xl border', toneClasses.tabTriggerClassName)}
            data-active="true"
            form={form}
            key={runId}
            mode="preview"
          />
        </div>
      </div>
    </div>
  );
}
