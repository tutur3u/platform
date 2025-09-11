import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Save } from '@tuturuuu/ui/icons';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { useTranslations } from 'next-intl';

export default function StickyBottomIndicator() {
  const { handleSave, isDirty, isSaving } = useTimeBlocking();
  const t = useTranslations();

  return (
    <StickyBottomBar
      show={isDirty}
      message={t('common.unsaved-changes')}
      actions={
        <Button
          variant="default"
          size="lg"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          <Save size={16} />
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      }
    />
  );
}
