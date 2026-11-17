'use client';

import { CornerDownLeft, FileEdit, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Kbd, KbdGroup } from '@tuturuuu/ui/kbd';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

// Keyboard hints mean nothing on touch screens.
const KEYBOARD_ONLY_CLASS = 'max-sm:hidden [@media(hover:none)]:hidden';
const HINT_CLASS = cn(
  'inline-flex items-center gap-1.5 text-muted-foreground text-xs',
  KEYBOARD_ONLY_CLASS
);

interface QuickCreateFooterProps {
  saveAsDraft: boolean;
  createMultiple: boolean;
  canSave: boolean;
  isLoading: boolean;
  onSaveAsDraftChange: (value: boolean) => void;
  onCreateMultipleChange: (value: boolean) => void;
  onSave: () => void;
}

/**
 * Create more, save as draft, keyboard hints and the primary Create action.
 * On phones it stays pinned under the scrolling body, above the safe area.
 */
export function QuickCreateFooter({
  saveAsDraft,
  createMultiple,
  canSave,
  isLoading,
  onSaveAsDraftChange,
  onCreateMultipleChange,
  onSave,
}: QuickCreateFooterProps) {
  const t = useTranslations();
  const { modKey } = usePlatform();
  const createMoreId = useId();
  const saveLabel = saveAsDraft
    ? t('task-drafts.save_as_draft')
    : t('ws-task-boards.dialog.create_task');
  const saveDraftLabel = t('ws-task-boards.dialog.quick_create.save_draft');

  return (
    <div
      data-testid="quick-create-footer"
      className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-2 max-sm:order-first max-sm:w-full">
        <Switch
          id={createMoreId}
          checked={createMultiple}
          onCheckedChange={onCreateMultipleChange}
        />
        <Label htmlFor={createMoreId} className="font-semibold text-sm">
          {t('ws-task-boards.dialog.quick_create.create_more')}
        </Label>
      </div>
      <Button
        type="button"
        variant={saveAsDraft ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={saveAsDraft}
        aria-label={saveDraftLabel}
        onClick={() => onSaveAsDraftChange(!saveAsDraft)}
        className="max-sm:size-12 max-sm:rounded-full max-sm:border max-sm:border-input"
      >
        <FileEdit aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">{saveDraftLabel}</span>
      </Button>
      <div className="flex-1 max-sm:hidden" />
      <span className={HINT_CLASS}>
        <Kbd>Tab</Kbd>
        {t('ws-task-boards.dialog.quick_create.next_hint')}
      </span>
      <span className={HINT_CLASS}>
        <Kbd>Esc</Kbd>
        {t('ws-task-boards.dialog.quick_create.close_hint')}
      </span>
      <Button
        type="button"
        size="sm"
        disabled={!canSave}
        onClick={onSave}
        className="min-w-28 max-sm:h-12 max-sm:flex-1 max-sm:text-base"
      >
        {isLoading ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('ws-task-boards.dialog.saving')}
          </>
        ) : (
          <>
            {saveLabel}
            <KbdGroup
              aria-hidden="true"
              className={cn(KEYBOARD_ONLY_CLASS, '-mr-1')}
            >
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                {modKey}
              </Kbd>
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                <CornerDownLeft />
              </Kbd>
            </KbdGroup>
          </>
        )}
      </Button>
    </div>
  );
}
