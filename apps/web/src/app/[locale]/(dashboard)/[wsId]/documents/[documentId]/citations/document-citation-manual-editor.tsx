'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { CitationManualEditorProps } from '@tuturuuu/ui/text-editor/citation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useMemo, useState } from 'react';
import {
  defaultContributorRole,
  MANUAL_CONTRIBUTOR_ROLES,
  MANUAL_FIELDS_BY_TYPE,
  MANUAL_SOURCE_TYPES,
  type ManualContributor,
  type ManualContributorRole,
  type ManualSourceType,
  type ManualTextField,
  type ManualWorkDraft,
  manualDraftFrom,
  manualDraftToWork,
  newContributor,
} from './manual-work-draft';
import {
  editableWork,
  manualDraftFromWork,
  mergeEditedWork,
} from './manual-work-edit';

const INPUT_TYPE: Partial<Record<ManualTextField, 'url' | 'date'>> = {
  url: 'url',
  accessed: 'date',
};

export function DocumentCitationManualEditor({
  draft: seed,
  work: savedWork,
  submitLabel,
  onSubmit,
  onCancel,
}: CitationManualEditorProps) {
  const t = useTranslations('documents.citations.manual');
  const prefix = useId();
  // Editing keeps the saved work as the base so unshown fields survive.
  const [base] = useState(() =>
    savedWork === undefined ? null : editableWork(savedWork)
  );
  const [draft, setDraft] = useState<ManualWorkDraft>(
    () => (base && manualDraftFromWork(base)) ?? manualDraftFrom(seed)
  );
  const [workId] = useState(() => `manual:${crypto.randomUUID()}`);
  const result = useMemo(
    () =>
      base ? mergeEditedWork(base, draft) : manualDraftToWork(draft, workId),
    [base, draft, workId]
  );
  const invalid = new Set(result.kind === 'invalid' ? result.fields : []);

  const set = <K extends keyof ManualWorkDraft>(
    key: K,
    value: ManualWorkDraft[K]
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const setContributor = (key: string, patch: Partial<ManualContributor>) =>
    set(
      'contributors',
      draft.contributors.map((entry) =>
        entry.key === key ? { ...entry, ...patch } : entry
      )
    );

  // An untouched form follows the type's usual credit (editors for edited books).
  const setType = (type: ManualSourceType) =>
    setDraft((current) => ({
      ...current,
      type,
      contributors: current.contributors.map((entry) =>
        !entry.family && !entry.given && !entry.name
          ? { ...entry, role: defaultContributorRole(type) }
          : entry
      ),
    }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (result.kind === 'ready') onSubmit(result.work);
  };

  const field = (name: ManualTextField) => {
    const id = `${prefix}-${name}`;
    return (
      <div key={name} className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t(`fields.${name}`)}</Label>
        <Input
          id={id}
          type={INPUT_TYPE[name] ?? 'text'}
          value={draft[name]}
          maxLength={name === 'url' ? 4000 : 2000}
          aria-invalid={invalid.has(name) || undefined}
          onChange={(event) => set(name, event.target.value)}
        />
      </div>
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-type`}>{t('type')}</Label>
        <Select
          value={draft.type}
          onValueChange={(value) => setType(value as ManualSourceType)}
        >
          <SelectTrigger id={`${prefix}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MANUAL_SOURCE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {field('title')}

      <fieldset
        className="flex flex-col gap-2"
        aria-invalid={invalid.has('contributors') || undefined}
      >
        <legend className="mb-1.5 font-medium text-sm">
          {t('contributors')}
        </legend>
        {draft.contributors.map((contributor, index) => (
          <div
            key={contributor.key}
            className="flex flex-wrap items-center gap-2 [&>input]:min-w-0 [&>input]:flex-1 [&>input]:basis-28"
          >
            <Select
              value={contributor.role}
              onValueChange={(role) =>
                setContributor(contributor.key, {
                  role: role as ManualContributorRole,
                })
              }
            >
              <SelectTrigger
                className="w-32 shrink-0"
                aria-label={t('contributor_role', { index: index + 1 })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_CONTRIBUTOR_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={contributor.kind}
              onValueChange={(kind) =>
                setContributor(contributor.key, {
                  kind: kind as ManualContributor['kind'],
                })
              }
            >
              <SelectTrigger
                className="w-32 shrink-0"
                aria-label={t('contributor_kind', { index: index + 1 })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="person">{t('person')}</SelectItem>
                <SelectItem value="organization">
                  {t('organization')}
                </SelectItem>
              </SelectContent>
            </Select>
            {contributor.kind === 'person' ? (
              <>
                <Input
                  aria-label={t('family', { index: index + 1 })}
                  placeholder={t('family_placeholder')}
                  value={contributor.family}
                  onChange={(event) =>
                    setContributor(contributor.key, {
                      family: event.target.value,
                    })
                  }
                />
                <Input
                  aria-label={t('given', { index: index + 1 })}
                  placeholder={t('given_placeholder')}
                  value={contributor.given}
                  onChange={(event) =>
                    setContributor(contributor.key, {
                      given: event.target.value,
                    })
                  }
                />
              </>
            ) : (
              <Input
                aria-label={t('organization_name', { index: index + 1 })}
                value={contributor.name}
                onChange={(event) =>
                  setContributor(contributor.key, { name: event.target.value })
                }
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t('remove_contributor', { index: index + 1 })}
              onClick={() =>
                set(
                  'contributors',
                  draft.contributors.filter(
                    (entry) => entry.key !== contributor.key
                  )
                )
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            set('contributors', [
              ...draft.contributors,
              newContributor('person', {
                role: defaultContributorRole(draft.type),
              }),
            ])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('add_contributor')}
        </Button>
      </fieldset>

      <fieldset
        className="flex flex-col gap-2"
        aria-invalid={invalid.has('date') || undefined}
      >
        <legend className="mb-1.5 font-medium text-sm">{t('date')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['year', 'month', 'day'] as const).map((part) => (
            <Input
              key={part}
              inputMode="numeric"
              maxLength={part === 'year' ? 4 : 2}
              aria-label={t(part)}
              placeholder={t(part)}
              disabled={draft.noDate}
              value={draft[part]}
              onChange={(event) => set(part, event.target.value)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${prefix}-nd`}
            checked={draft.noDate}
            onCheckedChange={(checked) => set('noDate', checked === true)}
          />
          <Label htmlFor={`${prefix}-nd`}>{t('no_date')}</Label>
        </div>
      </fieldset>

      {MANUAL_FIELDS_BY_TYPE[draft.type].map(field)}

      {result.kind === 'invalid' && (
        <p role="alert" className="text-destructive text-sm">
          {t('invalid', {
            fields: [...new Set(result.fields.map(issueKey))]
              .map((key) => t(`issue.${key}`))
              .join(', '),
          })}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={result.kind !== 'ready'}>
          {submitLabel ?? t('cite')}
        </Button>
      </div>
    </form>
  );
}

const ISSUE_KEYS = [
  'title',
  'contributors',
  'date',
  'containerTitle',
  'publisher',
  'publisherPlace',
  'pages',
  'doi',
  'isbn',
  'url',
  'accessed',
  'modelName',
] as const;
type IssueKey = (typeof ISSUE_KEYS)[number] | 'other';

/** Fields with their own translated label; anything else reads as "other details". */
function issueKey(name: string): IssueKey {
  return (ISSUE_KEYS as readonly string[]).includes(name)
    ? (name as IssueKey)
    : 'other';
}
