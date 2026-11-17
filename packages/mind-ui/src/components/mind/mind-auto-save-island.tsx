'use client';

import { Check, CircleAlert, LoaderCircle, Save } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { FloatingBar } from '@tuturuuu/ui/floating-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export type MindAutoSaveStatus = 'error' | 'saved' | 'saving' | 'unsaved';

type Props = {
  inline?: boolean;
  onSaveNow: () => void;
  status: MindAutoSaveStatus;
};

export function MindAutoSaveIsland({ inline, onSaveNow, status }: Props) {
  const t = useTranslations('mind');
  const config = getAutoSaveConfig(status);
  const label = t(config.labelKey);
  const Icon = config.icon;
  const button = (
    <Button
      aria-label={label}
      className={cn(!inline && 'touch-manipulation', config.className)}
      disabled={status === 'saving'}
      onClick={onSaveNow}
      size="icon"
      title={label}
      type="button"
      variant={inline ? 'ghost' : 'ghost'}
    >
      <Icon className={cn('h-4 w-4', status === 'saving' && 'animate-spin')} />
    </Button>
  );

  if (inline) return button;

  return (
    <div className="pointer-events-none absolute top-16 right-3 z-30">
      <FloatingBar
        // One control: a labelled group, not a toolbar.
        role="group"
        aria-label={label}
        className="pointer-events-auto bg-background/90"
      >
        {button}
      </FloatingBar>
    </div>
  );
}

function getAutoSaveConfig(status: MindAutoSaveStatus) {
  if (status === 'saving') {
    return {
      className: 'text-dynamic-blue',
      icon: LoaderCircle,
      labelKey: 'actions.autoSaveSaving',
    } as const;
  }

  if (status === 'error') {
    return {
      className: 'text-dynamic-red',
      icon: CircleAlert,
      labelKey: 'actions.autoSaveError',
    } as const;
  }

  if (status === 'unsaved') {
    return {
      className: 'text-dynamic-yellow',
      icon: Save,
      labelKey: 'actions.autoSaveUnsaved',
    } as const;
  }

  return {
    className: 'text-dynamic-green',
    icon: Check,
    labelKey: 'actions.autoSaveSaved',
  } as const;
}
