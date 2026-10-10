'use client';
import type {
  LettinDraft,
  LettinRecord,
  LettinWiki,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { WikiFactsEditor } from './wiki-facts-editor';
import { wikiOf } from './wiki-model';
import { WikiRelationshipsEditor } from './wiki-relationships-editor';

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
      <WikiFactsEditor
        kind={draft.kind}
        facts={wiki.facts}
        onChange={(facts) => patch({ facts })}
      />
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
      <WikiRelationshipsEditor
        key={recordId}
        wiki={wiki}
        entries={entries}
        recordId={recordId}
        onChange={onChange}
      />
    </div>
  );
}
