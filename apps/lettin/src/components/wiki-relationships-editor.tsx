'use client';
import type {
  LettinKind,
  LettinRecord,
  LettinRelationshipKind,
  LettinWiki,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  addRelationship,
  canChangeRelationshipKind,
  changeRelationshipKind,
  relationshipKinds,
  relationshipTargets,
} from './relationship-authoring-model';
import { entryKinds } from './wiki-model';

export function WikiRelationshipsEditor({
  wiki,
  entries,
  recordId,
  onChange,
}: {
  wiki: LettinWiki;
  entries: LettinRecord[];
  recordId: string;
  onChange: (wiki: LettinWiki) => void;
}) {
  const t = useTranslations('lettin');
  const [kind, setKind] = useState<LettinRelationshipKind>('related');
  const [search, setSearch] = useState('');
  const [entryKind, setEntryKind] = useState<LettinKind | ''>('');
  const [limit, setLimit] = useState(50);
  const candidates = relationshipTargets(
    entries,
    recordId,
    wiki,
    kind,
    search,
    entryKind
  );
  const full = wiki.relationships.length >= 100;
  const changeKind = (index: number, next: LettinRelationshipKind) => {
    const updated = changeRelationshipKind(wiki, index, next);
    if (updated !== wiki) onChange(updated);
  };
  return (
    <fieldset className="wiki-fieldset">
      <legend>{t('relationships')}</legend>
      {wiki.relationships.map((relation, index) => (
        // Legacy rows have no IDs; type edits must retain control identity.
        <div className="wiki-relationship-row" key={index}>
          <select
            aria-label={t('relationshipType')}
            value={relation.kind}
            onChange={(e) =>
              changeKind(index, e.target.value as LettinRelationshipKind)
            }
          >
            {relationshipKinds.map((value) => (
              <option
                key={value}
                value={value}
                disabled={!canChangeRelationshipKind(wiki, index, value)}
              >
                {t(`relationship${value}`)}
              </option>
            ))}
          </select>
          <span>
            {entries.find((entry) => entry.id === relation.targetId)?.draft
              .title ?? t('unavailableEntry')}
          </span>
          <Input
            aria-label={t('relationshipLabel')}
            maxLength={160}
            value={relation.label}
            onChange={(e) =>
              onChange({
                ...wiki,
                relationships: wiki.relationships.map((r, i) =>
                  i === index ? { ...r, label: e.target.value } : r
                ),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange({
                ...wiki,
                relationships: wiki.relationships.filter((_, i) => i !== index),
              })
            }
          >
            {t('remove')}
          </Button>
        </div>
      ))}
      <div className="mt-4 space-y-3">
        <p className="text-muted-foreground text-sm">
          {t('relationshipAuthoringHint')}
        </p>
        <label className="block space-y-1 text-sm">
          {t('newRelationshipType')}
          <select
            className="w-full rounded border border-input bg-card p-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as LettinRelationshipKind);
              setLimit(50);
            }}
          >
            {relationshipKinds.map((value) => (
              <option key={value} value={value}>
                {t(`relationship${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          {t('searchRelationshipTargets')}
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(50);
            }}
          />
        </label>
        <label className="block space-y-1 text-sm">
          {t('relationshipTargetKind')}
          <select
            className="w-full rounded border border-input bg-card p-2"
            value={entryKind}
            onChange={(e) => {
              setEntryKind(e.target.value as LettinKind | '');
              setLimit(50);
            }}
          >
            <option value="">{t('allEntryKinds')}</option>
            {entryKinds.map((value) => (
              <option key={value} value={value}>
                {t(`kind${value}`)}
              </option>
            ))}
          </select>
        </label>
        <p role="status" className="text-muted-foreground text-sm">
          {full
            ? t('relationshipLimit')
            : t('relationshipTargetCount', { count: candidates.length })}
        </p>
        <ul
          className="max-h-64 space-y-1 overflow-y-auto"
          aria-label={t('addRelationship')}
        >
          {candidates.slice(0, limit).map((entry) => (
            <li key={entry.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal break-words text-left"
                disabled={full}
                aria-label={t('addRelationshipTarget', {
                  title: entry.draft.title,
                  kind: t(`relationship${kind}`),
                })}
                onClick={() => {
                  const updated = addRelationship(
                    wiki,
                    entries,
                    recordId,
                    entry.id,
                    kind
                  );
                  if (updated !== wiki) onChange(updated);
                }}
              >
                {entry.draft.title} · {t(`kind${entry.draft.kind}`)}
              </Button>
            </li>
          ))}
        </ul>
        {candidates.length > limit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setLimit((value) => value + 50)}
          >
            {t('showMoreRelationshipTargets')}
          </Button>
        )}
      </div>
    </fieldset>
  );
}
