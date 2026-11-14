import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { Suggestion } from './review';

export function ReviewResults({
  suggestions,
  disabled,
  onAccept,
  onReject,
}: {
  suggestions: Suggestion[];
  disabled: boolean;
  onAccept: (index: number) => void;
  onReject: (index: number) => void;
}) {
  const t = useTranslations('draftAssistance');
  if (!suggestions.length) {
    return (
      <p role="status" className="text-sm">
        {t('empty')}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border" aria-label={t('suggestions')}>
      {suggestions.map((suggestion, index) => (
        <li
          key={`${suggestion.start}:${suggestion.end}`}
          className="space-y-2 py-3"
        >
          <div className="space-y-1 break-words whitespace-pre-wrap text-sm">
            <p>
              <span className="sr-only">{t('original')}: </span>
              <del>{suggestion.original}</del>
            </p>
            <p>
              <span className="sr-only">{t('replacement')}: </span>
              <ins>{suggestion.replacement || t('remove')}</ins>
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            {suggestion.explanation}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onAccept(index)}
            >
              {t('accept')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onReject(index)}
            >
              {t('reject')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
