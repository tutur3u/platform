'use client';

import { Play, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { listCodingChallenges } from '@/lib/coding/challenges';
import { CODING_LANGUAGES, type CodingLanguage } from '@/lib/coding/languages';

type PublicChallenge = ReturnType<typeof listCodingChallenges>[number];

export function CodingToolbar({
  availableLanguages,
  challenge,
  challenges,
  disabled,
  language,
  onSubmit,
  onTest,
  selected,
  selectChallenge,
  selectLanguage,
  submitting,
}: {
  availableLanguages: CodingLanguage[];
  challenge: PublicChallenge;
  challenges: PublicChallenge[];
  disabled: boolean;
  language: CodingLanguage;
  onSubmit: () => void;
  onTest: () => void;
  selected: string;
  selectChallenge: (value: string) => void;
  selectLanguage: (value: CodingLanguage) => void;
  submitting: boolean;
}) {
  const t = useTranslations('coding');
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <Select onValueChange={selectChallenge} value={selected}>
        <SelectTrigger
          aria-label={t('challengeList')}
          className="min-w-36 flex-1 sm:max-w-64"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {challenges.map((entry) => (
            <SelectItem key={entry.slug} value={entry.slug}>
              {t(`challenges.${entry.slug}.title`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="hidden rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs sm:inline-flex">
        {t(`topics.${challenge.topic}`)} ·{' '}
        {t(`difficulty.${challenge.difficulty}`)}
      </span>
      <span className="flex-1" />
      <Select
        onValueChange={(value) => selectLanguage(value as CodingLanguage)}
        value={language}
      >
        <SelectTrigger aria-label={t('language')} className="w-auto min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CODING_LANGUAGES.map((entry) => (
            <SelectItem key={entry} value={entry}>
              {t(`languages.${entry}`)}
              {availableLanguages.includes(entry) ? '' : ` · ${t('offline')}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              aria-label={t('runTests')}
              variant="outline"
              size="icon"
              disabled={disabled}
              onClick={onTest}
              type="button"
            >
              <Play className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('runTests')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              aria-label={submitting ? t('submitting') : t('submit')}
              size="icon"
              disabled={disabled}
              onClick={onSubmit}
              type="button"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {submitting ? t('submitting') : t('submit')}
        </TooltipContent>
      </Tooltip>
    </header>
  );
}
