'use client';

import { Download, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { getFormToneClasses } from '../theme';
import { SettingsSection } from './settings-section';

/** Portable JSON export and import. */
export function ImportExportSettingsSection({
  onExport,
  toneClasses,
  triggerImportFileInput,
}: {
  onExport: () => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  triggerImportFileInput: () => void;
}) {
  const t = useTranslations('forms');

  return (
    <SettingsSection
      description={t('settings.import_export_description')}
      icon={Download}
      title={t('settings.import_export')}
      value="import-export"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={toneClasses.secondaryButtonClassName}
          onClick={onExport}
        >
          <Download className="mr-2 h-4 w-4" />
          {t('settings.export_form')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={toneClasses.secondaryButtonClassName}
          onClick={triggerImportFileInput}
        >
          <Upload className="mr-2 h-4 w-4" />
          {t('settings.import_form')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('settings.import_export_hint')}
      </p>
    </SettingsSection>
  );
}
