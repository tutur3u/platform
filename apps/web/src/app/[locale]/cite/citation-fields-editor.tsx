'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';
import { CitationAuthorsEditor } from './citation-authors-editor';
import {
  type CitationDraft,
  type DraftIssue,
  type DraftTextField,
  FIELDS_BY_TYPE,
  SOURCE_TYPES,
  type SourceType,
} from './citation-draft';

type FieldConfig = {
  inputMode?: 'numeric' | 'url';
  type?: 'date' | 'url';
  span?: 'full' | 'third';
  maxLength: number;
};

const FIELD_CONFIG: Record<DraftTextField, FieldConfig> = {
  title: { span: 'full', maxLength: 2000 },
  year: { inputMode: 'numeric', maxLength: 4 },
  publisher: { maxLength: 2000 },
  publisherPlace: { maxLength: 2000 },
  containerTitle: { span: 'full', maxLength: 2000 },
  volume: { span: 'third', maxLength: 2000 },
  issue: { span: 'third', maxLength: 2000 },
  pages: { span: 'third', maxLength: 2000 },
  DOI: { maxLength: 2000 },
  URL: { type: 'url', inputMode: 'url', span: 'full', maxLength: 2000 },
  ISBN: { maxLength: 2000 },
  accessed: { type: 'date', maxLength: 10 },
};

const SPAN_CLASS = {
  full: 'sm:col-span-6',
  third: 'sm:col-span-2',
  half: 'sm:col-span-3',
} as const;

export function CitationFieldsEditor({
  draft,
  issues,
  titleRef,
  onChange,
  onReset,
}: {
  draft: CitationDraft;
  issues: readonly DraftIssue[];
  titleRef: Ref<HTMLInputElement>;
  onChange: (update: (draft: CitationDraft) => CitationDraft) => void;
  onReset: () => void;
}) {
  const t = useTranslations('cite.details');
  const tField = useTranslations('cite.fields');

  const fieldLabel = (field: DraftTextField) =>
    field === 'containerTitle'
      ? tField(draft.type === 'webpage' ? 'website' : 'journal')
      : tField(field);

  return (
    <section
      aria-labelledby="cite-details-heading"
      className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-semibold text-base tracking-tight"
          id="cite-details-heading"
        >
          {t('heading')}
        </h2>
        <Button onClick={onReset} size="sm" type="button" variant="ghost">
          {t('reset')}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-sm" id="cite-type-label">
          {t('type_label')}
        </p>
        <ToggleGroup
          aria-labelledby="cite-type-label"
          className="flex w-full flex-wrap justify-start sm:w-auto"
          onValueChange={(value) => {
            if ((SOURCE_TYPES as readonly string[]).includes(value))
              onChange((current) => ({
                ...current,
                type: value as SourceType,
              }));
          }}
          type="single"
          value={draft.type}
          variant="outline"
        >
          {SOURCE_TYPES.map((type) => (
            <ToggleGroupItem
              className="flex-1 px-3 sm:flex-none"
              key={type}
              value={type}
            >
              {t(`types.${type}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <CitationAuthorsEditor
        authors={draft.authors}
        invalid={issues.includes('authors')}
        onChange={(update) =>
          onChange((current) => ({
            ...current,
            authors: update(current.authors),
          }))
        }
      />

      <div className="grid gap-4 sm:grid-cols-6">
        {FIELDS_BY_TYPE[draft.type].map((field) => {
          const config = FIELD_CONFIG[field];
          const id = `cite-field-${field}`;
          const invalid = issues.includes(field);
          return (
            <div
              className={`space-y-1.5 ${SPAN_CLASS[config.span ?? 'half']}`}
              key={field}
            >
              <Label htmlFor={id}>{fieldLabel(field)}</Label>
              <Input
                aria-describedby={invalid ? `${id}-error` : undefined}
                aria-invalid={invalid || undefined}
                autoComplete="off"
                id={id}
                inputMode={config.inputMode}
                maxLength={config.maxLength}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((current) => ({ ...current, [field]: value }));
                }}
                ref={field === 'title' ? titleRef : undefined}
                type={config.type ?? 'text'}
                value={draft[field]}
              />
              {invalid ? (
                <p className="text-destructive text-sm" id={`${id}-error`}>
                  {field === 'year' ? t('invalid_year') : t('invalid_value')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
