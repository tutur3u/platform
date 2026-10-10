'use client';
import type { LettinKind, LettinWiki } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';
import { CharacterFactStarters } from './character-fact-starters';

export function WikiFactsEditor({
  facts,
  kind,
  onChange,
}: {
  facts: LettinWiki['facts'];
  kind?: LettinKind;
  onChange: (facts: LettinWiki['facts']) => void;
}) {
  const t = useTranslations('lettin');
  const container = useRef<HTMLFieldSetElement>(null);
  const [focus, setFocus] = useState<{
    index: number;
    direction: 'up' | 'down';
  } | null>(null);
  useLayoutEffect(() => {
    if (!focus) return;
    container.current
      ?.querySelector<HTMLButtonElement>(
        `[data-fact-index="${focus.index}"] [data-move="${focus.direction}"]`
      )
      ?.focus();
    setFocus(null);
  }, [focus]);
  const move = (index: number, direction: 'up' | 'down') => {
    const target = index + (direction === 'up' ? -1 : 1);
    if (target < 0 || target >= facts.length) return;
    const next = [...facts];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    // The destination boundary button may be disabled; focus the other move control.
    setFocus({
      index: target,
      direction:
        target === 0 ? 'down' : target === facts.length - 1 ? 'up' : direction,
    });
  };
  return (
    <fieldset ref={container} className="wiki-fieldset">
      <legend>{t('facts')}</legend>
      <p className="mb-3 text-muted-foreground text-xs">{t('factOrderHint')}</p>
      {kind === 'character' && (
        <CharacterFactStarters
          disabled={facts.length >= 40}
          onAdd={(label) => {
            if (facts.length < 40) onChange([...facts, { label, value: '' }]);
          }}
        />
      )}
      {facts.map((fact, index) => (
        <div className="wiki-property-row" key={index} data-fact-index={index}>
          <Input
            aria-label={t('factLabel')}
            maxLength={80}
            value={fact.label}
            onChange={(e) =>
              onChange(
                facts.map((value, i) =>
                  i === index ? { ...value, label: e.target.value } : value
                )
              )
            }
          />
          <Input
            aria-label={t('factValue')}
            maxLength={1000}
            value={fact.value}
            onChange={(e) =>
              onChange(
                facts.map((value, i) =>
                  i === index ? { ...value, value: e.target.value } : value
                )
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              data-move="up"
              disabled={index === 0}
              aria-label={t('factMoveUpLabel', { position: index + 1 })}
              onClick={() => move(index, 'up')}
            >
              {t('factMoveUp')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-move="down"
              disabled={index === facts.length - 1}
              aria-label={t('factMoveDownLabel', { position: index + 1 })}
              onClick={() => move(index, 'down')}
            >
              {t('factMoveDown')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(facts.filter((_, i) => i !== index))}
            >
              {t('remove')}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={facts.length >= 40}
        onClick={() => onChange([...facts, { label: '', value: '' }])}
      >
        {t('addFact')}
      </Button>
    </fieldset>
  );
}
