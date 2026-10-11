'use client';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { wikiOf } from './wiki-model';

const previewText = (text: string, limit: number) => {
  const characters = Array.from(text.trim());
  return characters.length > limit
    ? `${characters.slice(0, limit).join('')}…`
    : characters.join('');
};
export function characterCardFacts(draft: LettinDraft) {
  if (draft.kind !== 'character') return [];
  return wikiOf(draft)
    .facts.filter((fact) => fact.label.trim() && fact.value.trim())
    .slice(0, 3)
    .map((fact) => ({
      label: previewText(fact.label, 80),
      value: previewText(fact.value, 160),
    }));
}
export function CharacterCardFacts({ draft }: { draft: LettinDraft }) {
  const t = useTranslations('lettin');
  const facts = characterCardFacts(draft);
  if (!facts.length) return null;
  return (
    <span className="mt-3 block space-y-1 border-border border-t pt-2 text-sm">
      <span className="sr-only">{t('characterFactsPreview')}</span>
      {facts.map((fact, index) => (
        <span className="block break-words" key={`${index}-${fact.label}`}>
          <span className="font-medium">{fact.label}: </span>
          <span className="text-muted-foreground">{fact.value}</span>
        </span>
      ))}
    </span>
  );
}
