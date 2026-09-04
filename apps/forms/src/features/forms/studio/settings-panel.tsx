'use client';

import { Accordion } from '@tuturuuu/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { useWatch } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { FormStudioInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import type { FormResponseSummary } from '../types';
import { EmbedSettingsSection } from './settings-embed-section';
import { ExperienceSettingsSection } from './settings-experience-section';
import { ImportExportSettingsSection } from './settings-import-export-section';
import { PublishingSettingsSection } from './settings-publishing-section';
import { SeoSettingsSection } from './settings-seo-section';
import type { StudioForm } from './studio-utils';
import { importFormStudioPayload } from './studio-utils';

/**
 * The settings tab.
 *
 * Orchestration only: it owns the import file input and its confirmation
 * dialog, subscribes to the form values the sections need, and lays the
 * sections out. Each section owns its own fields — the panel used to hold all
 * of them inline and had grown to the repo's 700-line ceiling, which left no
 * room to add one.
 */
export function SettingsPanel({
  form,
  shareCode,
  toneClasses,
  onOpenPreview,
  onExport,
  onImport,
  isDirty,
  responseSummary,
  wsId,
}: {
  form: StudioForm;
  shareCode?: string | null;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  onOpenPreview: () => void;
  onExport: () => void;
  onImport: (data: FormStudioInput) => void;
  isDirty: boolean;
  responseSummary: FormResponseSummary;
  wsId: string;
}) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const themePreset = useWatch({
    control: form.control,
    name: 'theme.presetId',
  });
  const headlineFontId = useWatch({
    control: form.control,
    name: 'theme.headlineFontId',
  });
  const bodyFontId = useWatch({
    control: form.control,
    name: 'theme.bodyFontId',
  });
  const status = useWatch({
    control: form.control,
    name: 'status',
  });
  const accessMode = useWatch({
    control: form.control,
    name: 'accessMode',
  });
  const openAt = useWatch({
    control: form.control,
    name: 'openAt',
  });
  const closeAt = useWatch({
    control: form.control,
    name: 'closeAt',
  });
  const maxResponses = useWatch({
    control: form.control,
    name: 'maxResponses',
  });
  const showProgressBar = useWatch({
    control: form.control,
    name: 'settings.showProgressBar',
  });
  const allowMultipleSubmissions = useWatch({
    control: form.control,
    name: 'settings.allowMultipleSubmissions',
  });
  const oneResponsePerUser = useWatch({
    control: form.control,
    name: 'settings.oneResponsePerUser',
  });
  const oneResponseLimitLocked =
    responseSummary.hasMultipleSubmissionsByUser && !oneResponsePerUser;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = shareCode ? `${origin}/shared/forms/${shareCode}` : '';
  const canOpenLiveForm = !!shareCode && status === 'published' && !isDirty;

  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPendingData, setImportPendingData] =
    useState<FormStudioInput | null>(null);

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = importFormStudioPayload(text);
      if (!result.ok) {
        toast.error(
          t('studio.import_failed', {
            error: result.error?.trim() || t('studio.import_error_generic'),
          })
        );
        return;
      }
      setImportPendingData(result.data);
    } catch {
      toast.error(
        t('studio.import_failed', {
          error: t('studio.import_read_failed'),
        })
      );
    }
  };

  const triggerImportFileInput = () => {
    importFileInputRef.current?.click();
  };

  const handleImportConfirm = () => {
    if (importPendingData) {
      onImport(importPendingData);
      setImportPendingData(null);
    }
  };

  const handleImportCancel = () => {
    setImportPendingData(null);
  };

  return (
    <>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        onChange={handleImportFileChange}
      />
      <AlertDialog
        open={importPendingData !== null}
        onOpenChange={(open) => {
          if (!open) handleImportCancel();
        }}
      >
        <AlertDialogContent className="rounded-[1.75rem] border-border/60">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.import_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.import_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleImportCancel}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm}>
              {t('settings.import_confirm_action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Accordion
        type="multiple"
        defaultValue={['publishing-and-access', 'experience-controls']}
        className="space-y-4"
      >
        <PublishingSettingsSection
          accessMode={accessMode}
          canOpenLiveForm={canOpenLiveForm}
          closeAt={closeAt}
          form={form}
          isDirty={isDirty}
          maxResponses={maxResponses}
          onOpenPreview={onOpenPreview}
          openAt={openAt}
          shareCode={shareCode}
          shareUrl={shareUrl}
          status={status}
          toneClasses={toneClasses}
        />

        <ExperienceSettingsSection
          accessMode={accessMode}
          allowMultipleSubmissions={allowMultipleSubmissions}
          bodyFontId={bodyFontId}
          form={form}
          headlineFontId={headlineFontId}
          oneResponseLimitLocked={oneResponseLimitLocked}
          oneResponsePerUser={oneResponsePerUser}
          responseSummary={responseSummary}
          showProgressBar={showProgressBar}
          themePreset={themePreset}
          toneClasses={toneClasses}
        />

        <EmbedSettingsSection shareCode={shareCode} toneClasses={toneClasses} />

        <SeoSettingsSection
          form={form}
          shareCode={shareCode}
          toneClasses={toneClasses}
          wsId={wsId}
        />

        <ImportExportSettingsSection
          onExport={onExport}
          toneClasses={toneClasses}
          triggerImportFileInput={triggerImportFileInput}
        />
      </Accordion>
    </>
  );
}
