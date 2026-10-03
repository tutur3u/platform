'use client';
import type {
  LettinDraft,
  LettinRecord,
  LettinRelationshipKind,
  LettinWiki,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { wikiOf } from './wiki-model';

const relationKinds: LettinRelationshipKind[] = [
  'related',
  'family',
  'friend',
  'rival',
  'member',
  'located',
  'part',
  'role',
  'appears',
];
export function WikiDetailsEditor({
  draft,
  entries,
  recordId,
  onChange,
}: {
  draft: LettinDraft;
  entries: LettinRecord[];
  recordId: string;
  onChange: (wiki: LettinWiki) => void;
}) {
  const t = useTranslations('lettin');
  const wiki = wikiOf(draft);
  const patch = (value: Partial<LettinWiki>) => onChange({ ...wiki, ...value });
  return (
    <div className="wiki-details-grid">
      <label className="block space-y-2 text-sm">
        {t('aliases')}
        <Input
          value={wiki.aliases.join(', ')}
          onChange={(e) =>
            patch({
              aliases: e.target.value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)
                .slice(0, 30),
            })
          }
        />
        <span className="text-muted-foreground text-xs">
          {t('aliasesHint')}
        </span>
      </label>
      <fieldset className="wiki-fieldset">
        <legend>{t('facts')}</legend>
        {wiki.facts.map((fact, index) => (
          <div className="wiki-property-row" key={index}>
            <Input
              aria-label={t('factLabel')}
              maxLength={80}
              value={fact.label}
              onChange={(e) =>
                patch({
                  facts: wiki.facts.map((v, i) =>
                    i === index ? { ...v, label: e.target.value } : v
                  ),
                })
              }
            />
            <Input
              aria-label={t('factValue')}
              maxLength={1000}
              value={fact.value}
              onChange={(e) =>
                patch({
                  facts: wiki.facts.map((v, i) =>
                    i === index ? { ...v, value: e.target.value } : v
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({ facts: wiki.facts.filter((_, i) => i !== index) })
              }
            >
              {t('remove')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={wiki.facts.length >= 40}
          onClick={() =>
            patch({ facts: [...wiki.facts, { label: '', value: '' }] })
          }
        >
          {t('addFact')}
        </Button>
      </fieldset>
      <fieldset className="wiki-fieldset">
        <legend>{t('chronology')}</legend>
        <p className="mb-3 text-muted-foreground text-sm">
          {t('chronologyHint')}
        </p>
        {wiki.chronology ? (
          <>
            <div className="wiki-property-row">
              <label>
                {t('dateLabel')}
                <Input
                  maxLength={100}
                  value={wiki.chronology.label}
                  onChange={(e) =>
                    patch({
                      chronology: {
                        ...wiki.chronology!,
                        label: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                {t('era')}
                <Input
                  maxLength={100}
                  value={wiki.chronology.era}
                  onChange={(e) =>
                    patch({
                      chronology: { ...wiki.chronology!, era: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                {t('timelineOrder')}
                <Input
                  type="number"
                  step="any"
                  min={-1e12}
                  max={1e12}
                  value={wiki.chronology.order}
                  onChange={(e) =>
                    patch({
                      chronology: {
                        ...wiki.chronology!,
                        order: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => patch({ chronology: undefined })}
            >
              {t('removeDate')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patch({ chronology: { order: 0, label: '', era: '' } })
            }
          >
            {t('addDate')}
          </Button>
        )}
      </fieldset>
      <fieldset className="wiki-fieldset">
        <legend>{t('relationships')}</legend>
        {wiki.relationships.map((relation, index) => (
          <div
            className="wiki-relationship-row"
            key={`${relation.targetId}-${relation.kind}`}
          >
            <select
              aria-label={t('relationshipType')}
              value={relation.kind}
              onChange={(e) =>
                patch({
                  relationships: wiki.relationships.map((v, i) =>
                    i === index
                      ? { ...v, kind: e.target.value as LettinRelationshipKind }
                      : v
                  ),
                })
              }
            >
              {relationKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`relationship${kind}`)}
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
                patch({
                  relationships: wiki.relationships.map((v, i) =>
                    i === index ? { ...v, label: e.target.value } : v
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({
                  relationships: wiki.relationships.filter(
                    (_, i) => i !== index
                  ),
                })
              }
            >
              {t('remove')}
            </Button>
          </div>
        ))}
        <select
          aria-label={t('addRelationship')}
          value=""
          disabled={wiki.relationships.length >= 100}
          onChange={(e) => {
            if (e.target.value)
              patch({
                relationships: [
                  ...wiki.relationships,
                  { targetId: e.target.value, kind: 'related', label: '' },
                ],
              });
          }}
        >
          <option value="">{t('addRelationship')}</option>
          {entries
            .filter(
              (entry) =>
                entry.id !== recordId &&
                !wiki.relationships.some(
                  (r) => r.targetId === entry.id && r.kind === 'related'
                )
            )
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.draft.title} · {t(`kind${entry.draft.kind}`)}
              </option>
            ))}
        </select>
      </fieldset>
    </div>
  );
}
