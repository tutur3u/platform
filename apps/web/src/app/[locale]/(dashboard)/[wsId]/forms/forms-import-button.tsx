'use client';

import { Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { importFormStudioPayload } from '@/features/forms/studio/studio-utils';

export function FormsImportButton({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const t = useTranslations('forms');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFilePick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = importFormStudioPayload(text);
      if (!parsed.ok) {
        toast.error(t('studio.import_failed', { error: parsed.error }));
        return;
      }

      const response = await fetch(
        `/api/v1/workspaces/${workspaceSlug}/forms`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(parsed.data),
        }
      );

      let payload: { id?: string; error?: string } = {};
      try {
        payload = (await response.json()) as { id?: string; error?: string };
      } catch {
        payload = { error: t('studio.import_error_generic') };
      }
      if (!response.ok || !payload.id) {
        toast.error(
          t('studio.import_failed', {
            error: payload.error?.trim() || t('studio.import_error_generic'),
          })
        );
        return;
      }

      toast.success(t('studio.import_success'));
      router.refresh();
    } catch {
      toast.error(
        t('studio.import_failed', {
          error: t('studio.import_read_failed'),
        })
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button variant="outline" onClick={handleFilePick} disabled={isImporting}>
        <Upload className="mr-2 h-4 w-4" />
        {isImporting ? t('studio.saving') : t('settings.import_form')}
      </Button>
    </>
  );
}
