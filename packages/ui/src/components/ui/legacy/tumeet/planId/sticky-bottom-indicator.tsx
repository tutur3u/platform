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
          size="lg"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="bg-dynamic-blue/10 border border-dynamic-blue/20 text-dynamic-blue hover:bg-dynamic-blue/20"
        >
          <Save size={16} />
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      }
    />
  );
}
