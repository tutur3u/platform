'use client';

import { useMutation } from '@tanstack/react-query';
import { updateCurrentUserProfile } from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useId, useState } from 'react';
import UserAvatar from '@/components/settings/settings-avatar';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import {
  type Locale,
  supportedLocales,
  usePathname,
  useRouter,
} from '@/i18n/routing';
import { ProfileScene } from './onboarding-illustrations';
import { InlineAlert, SegmentedChoice } from './welcome-controls';
import { WELCOME_THEMES, type WelcomeTheme } from './welcome-model';
import {
  saveAppearanceAndLanguage,
  saveProductNews,
} from './welcome-persistence';
import { StepHeading } from './welcome-shell';

export type ProfileDraft = {
  language: Locale;
  name: string;
  productNews: boolean;
};

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
};

export function StepProfile({
  avatarUser,
  draft,
  hasProductNewsRow,
  initialName,
  initialProductNews,
  onAdvance,
  onChange,
}: {
  avatarUser: WorkspaceUser;
  draft: ProfileDraft;
  hasProductNewsRow: boolean;
  initialName: string;
  initialProductNews: boolean;
  onAdvance: () => Promise<void>;
  onChange: (draft: ProfileDraft) => void;
}) {
  const t = useTranslations('onboarding_flow');
  const nameId = useId();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const activeTheme = (theme ?? 'system') as WelcomeTheme;

  const save = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      if (name && name !== initialName.trim()) {
        await updateCurrentUserProfile({ display_name: name });
      }
      // Off is stored too: with no row the platform default would be on.
      if (draft.productNews !== initialProductNews || !hasProductNewsRow) {
        await saveProductNews(draft.productNews);
      }
      await saveAppearanceAndLanguage({
        language: draft.language,
        theme: activeTheme,
      });
      await onAdvance();
    },
    onError: () => setError(t('save_error')),
    onSuccess: () => {
      setError(null);
      if (draft.language === locale) return;
      // The language applies to the next screen: same step list, new locale.
      persistLocalePreference(draft.language, LOCALE_COOKIE_NAME);
      router.replace(`${pathname}?step=space`, {
        locale: draft.language,
        scroll: false,
      });
    },
  });

  return (
    <>
      <StepHeading
        scene={<ProfileScene className="w-[96px] sm:w-[110px]" />}
        subtitle={t('profile_subtitle')}
        title={t('profile_title')}
      />
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <UserAvatar user={avatarUser} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={nameId}>{t('display_name')}</Label>
          <Input
            autoComplete="name"
            className="h-11 rounded-xl"
            id={nameId}
            maxLength={80}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            placeholder={t('display_name_placeholder')}
            value={draft.name}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-sm">{t('language')}</span>
        <SegmentedChoice
          label={t('language')}
          onChange={(language) => onChange({ ...draft, language })}
          options={supportedLocales.map((value) => ({
            label: LOCALE_LABELS[value],
            lang: value,
            value,
          }))}
          value={draft.language}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-sm">{t('appearance')}</span>
        <SegmentedChoice<WelcomeTheme>
          label={t('appearance')}
          onChange={setTheme}
          options={WELCOME_THEMES.map((value) => ({
            label: t(`theme_${value}`),
            value,
          }))}
          value={activeTheme}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="font-semibold" htmlFor={`${nameId}-news`}>
            {t('news_title')}
          </Label>
          <span className="text-muted-foreground text-xs">
            {t('news_description')}
          </span>
        </div>
        <Switch
          checked={draft.productNews}
          id={`${nameId}-news`}
          onCheckedChange={(productNews) => onChange({ ...draft, productNews })}
        />
      </div>

      <InlineAlert message={error} />
      <div className="flex justify-end">
        <Button
          className="h-11 min-w-36 rounded-full"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          type="button"
        >
          {save.isPending ? t('saving') : t('continue')}
        </Button>
      </div>
    </>
  );
}
