'use client';

import { Plus } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CourseCreatePanel({
  isPending,
  onCreate,
}: {
  isPending: boolean;
  onCreate: (payload: { description?: string; name: string }) => void;
}) {
  const t = useTranslations('teachModules');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    const trimmedName = name.trim();
    if (!trimmedName || isPending) return;
    onCreate({
      description: description.trim() || undefined,
      name: trimmedName,
    });
    setName('');
    setDescription('');
  }

  return (
    <div className="grid gap-3 border-2 border-border bg-card p-4 shadow-[5px_5px_0_var(--border)] md:grid-cols-[minmax(12rem,1fr)_minmax(14rem,2fr)_auto]">
      <input
        className="h-11 border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        placeholder={t('createNamePlaceholder')}
        type="text"
        value={name}
      />
      <input
        className="h-11 border-2 border-border bg-background px-3 outline-none focus:border-primary"
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        placeholder={t('createDescriptionPlaceholder')}
        type="text"
        value={description}
      />
      <button
        className="inline-flex h-11 items-center justify-center gap-2 border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!name.trim() || isPending}
        onClick={submit}
        type="button"
      >
        <Plus className="h-4 w-4" />
        {isPending ? t('creating') : t('createCourse')}
      </button>
    </div>
  );
}
