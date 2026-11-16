'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { type DraftAuthor, newAuthor } from './citation-draft';

const MAX_AUTHORS = 100;

export function CitationAuthorsEditor({
  authors,
  invalid,
  onChange,
}: {
  authors: DraftAuthor[];
  invalid: boolean;
  onChange: (update: (authors: DraftAuthor[]) => DraftAuthor[]) => void;
}) {
  const t = useTranslations('cite.authors');
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const update = (index: number, patch: Partial<DraftAuthor>) =>
    onChange((current) =>
      current.map((author, i) =>
        i === index ? { ...author, ...patch } : author
      )
    );

  return (
    <fieldset aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}>
      <legend className="font-medium text-sm">{t('legend')}</legend>
      <p className="mt-1 text-muted-foreground text-sm" id={hintId}>
        {t('hint')}
      </p>
      <ol className="mt-3 space-y-3">
        {authors.map((author, index) => {
          const familyId = `${baseId}-${index}-family`;
          const givenId = `${baseId}-${index}-given`;
          const rowInvalid =
            invalid && !author.family.trim() && !!author.given.trim();
          return (
            <li
              className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
              key={author.id}
            >
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor={familyId}>{t('family')}</Label>
                <Input
                  aria-invalid={rowInvalid || undefined}
                  autoComplete="off"
                  id={familyId}
                  maxLength={200}
                  onChange={(event) =>
                    update(index, { family: event.target.value })
                  }
                  value={author.family}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={givenId}>{t('given')}</Label>
                <Input
                  autoComplete="off"
                  id={givenId}
                  maxLength={200}
                  onChange={(event) =>
                    update(index, { given: event.target.value })
                  }
                  value={author.given}
                />
              </div>
              <Button
                aria-label={t('remove', { number: index + 1 })}
                disabled={
                  authors.length === 1 && !author.family && !author.given
                }
                onClick={() =>
                  onChange((current) =>
                    current.length === 1
                      ? [newAuthor()]
                      : current.filter((_, i) => i !== index)
                  )
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ol>
      {invalid ? (
        <p className="mt-2 text-destructive text-sm" id={errorId}>
          {t('invalid')}
        </p>
      ) : null}
      <Button
        className="mt-3"
        disabled={authors.length >= MAX_AUTHORS}
        onClick={() => onChange((current) => [...current, newAuthor()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        {t('add')}
      </Button>
    </fieldset>
  );
}
