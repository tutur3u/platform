'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Progress } from '@repo/ui/components/ui/progress';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ImportDialogContent({ wsId }: { wsId: string }) {
  const t = useTranslations();

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        selectedFile.type !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        setError(t('common.invalid-file-type'));
        setFile(undefined);
      } else {
        setError(null);
        setFile(selectedFile);
      }
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>{t('common.export-content')}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1">
        <div className="grid w-full max-w-sm items-center gap-2">
          <Label htmlFor="file">{t('common.file-name')}</Label>
          <Input
            type="file"
            id="file"
            placeholder={t('common.file-name')}
            onChange={handleFileChange}
            accept=".xlsx"
            className="input-class w-full pb-4"
            disabled={uploading}
          />
          {error && <p className="text-red-500">{error}</p>}
        </div>

        {uploading && (
          <div>
            <Progress className="h-2 w-full" />
          </div>
        )}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>

        <Button disabled={uploading || !file}>
          {uploading ? t('common.loading') : t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}
