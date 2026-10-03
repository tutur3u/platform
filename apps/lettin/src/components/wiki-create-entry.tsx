'use client';
import { Plus } from '@tuturuuu/icons';
import type { LettinKind } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { emptyDraft, useLettinMutation } from './use-lettin';
import { entryKinds } from './wiki-model';
export function WikiCreateEntry({
  wsId,
  worldId,
  defaultKind,
  disabled,
  onCreated,
}: {
  wsId: string;
  worldId: string;
  defaultKind?: LettinKind;
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('lettin');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<LettinKind>(defaultKind ?? 'page');
  const mutation = useLettinMutation(wsId);
  return (
    <form
      className="wiki-create-entry"
      onSubmit={async (e) => {
        e.preventDefault();
        if (disabled || mutation.isPending || !title.trim()) return;
        try {
          const result = await mutation.mutateAsync({
            action: 'createEntry',
            worldId,
            draft: {
              ...emptyDraft(title.trim()),
              kind,
              wiki: { aliases: [], facts: [], relationships: [] },
            },
          });
          setTitle('');
          onCreated(result.id);
        } catch {
          /* Mutation owns the error. */
        }
      }}
    >
      <h3>{t('newEntry')}</h3>
      <Input
        aria-label={t('title')}
        placeholder={t('entryTitle')}
        value={title}
        required
        maxLength={160}
        onChange={(e) => setTitle(e.target.value)}
        disabled={disabled || mutation.isPending}
      />
      <select
        aria-label={t('kind')}
        value={kind}
        onChange={(e) => setKind(e.target.value as LettinKind)}
        disabled={disabled || mutation.isPending}
      >
        {entryKinds.map((value) => (
          <option key={value} value={value}>
            {t(`kind${value}`)}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || mutation.isPending || !title.trim()}
      >
        <Plus size={16} />
        {t('addEntry')}
      </Button>
      {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
    </form>
  );
}
