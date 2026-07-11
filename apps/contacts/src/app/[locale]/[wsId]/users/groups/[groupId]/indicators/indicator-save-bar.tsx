'use client';

import { RotateCcw, Save } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface IndicatorSaveBarProps {
  disabled: boolean;
  isSubmitting: boolean;
  onReset: () => void;
  onSubmit: () => void;
  show: boolean;
}

export function IndicatorSaveBar({
  disabled,
  isSubmitting,
  onReset,
  onSubmit,
  show,
}: IndicatorSaveBarProps) {
  const t = useTranslations();

  return (
    <StickyBottomBar
      show={show}
      message={t('common.unsaved-changes')}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={disabled}
          >
            <RotateCcw className="h-4 w-4" />
            {t('common.reset')}
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={disabled}
            className={cn(
              'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
            )}
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    />
  );
}
