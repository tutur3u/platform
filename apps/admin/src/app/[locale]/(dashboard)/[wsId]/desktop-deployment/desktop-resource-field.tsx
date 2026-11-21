'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';

export function DesktopResourceField({
  name,
  file,
  configured,
  pending,
  save,
  remove,
}: {
  name: string;
  file: boolean;
  configured: boolean;
  pending: boolean;
  save: (value: string | File) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const t = useTranslations('desktop-deployment.vault');
  const id = useId();
  const [value, setValue] = useState('');
  const [upload, setUpload] = useState<File | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = file ? upload : value;
    if (!data) return;
    try {
      await save(data);
      setValue('');
      setUpload(null);
      form.reset();
    } catch {
      /* The parent owns the localized failure announcement. */
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <Label htmlFor={id}>{t(`resources.${name}`)}</Label>
        <span className="text-muted-foreground text-xs">
          {t(configured ? 'configured' : 'missing')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {file ? (
          <Input
            id={id}
            type="file"
            disabled={pending}
            className="min-w-0 flex-1"
            accept={name.endsWith('_p8') ? '.p8,.pem' : '.pfx,.p12'}
            onChange={(event) => setUpload(event.target.files?.[0] ?? null)}
          />
        ) : (
          <Input
            id={id}
            type="password"
            value={value}
            autoComplete="new-password"
            disabled={pending}
            placeholder={t('emptyInput')}
            className="min-w-0 flex-1"
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <Button
          size="sm"
          type="submit"
          disabled={pending || !(file ? upload : value)}
        >
          {t('save')}
        </Button>
        {configured && (
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={pending}
            onClick={() => {
              void remove().catch(() => {});
            }}
          >
            {t('remove')}
          </Button>
        )}
      </div>
    </form>
  );
}
