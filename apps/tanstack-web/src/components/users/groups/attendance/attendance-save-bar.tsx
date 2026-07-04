'use client';

import { Check, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type AttendanceSaveBarProps = {
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
  pendingCount: number;
};

export function AttendanceSaveBar({
  isSaving,
  onReset,
  onSave,
  pendingCount,
}: AttendanceSaveBarProps) {
  const tCommon = useTranslations('common');
  const tAtt = useTranslations('ws-user-group-attendance');

  return (
    <StickyBottomBar
      actions={
        <>
          <Button
            disabled={isSaving}
            onClick={onReset}
            size="sm"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
            {tCommon('reset')}
          </Button>
          <Button
            className={cn(
              'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
            )}
            disabled={isSaving}
            onClick={onSave}
            size="sm"
          >
            <Check className="h-4 w-4" />
            {isSaving ? tCommon('saving') : tCommon('save')}
          </Button>
        </>
      }
      message={`${tAtt('unsaved_changes_message')} (${pendingCount})`}
      show={pendingCount > 0}
    />
  );
}
