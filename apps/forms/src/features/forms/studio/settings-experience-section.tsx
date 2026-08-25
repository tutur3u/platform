'use client';

import {
  AlertTriangle,
  CircleCheckBig,
  FileText,
  MessageSquare,
} from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getFormFontLabel } from '../fonts';
import { FieldLabel } from '../form-icons';
import type { FormStudioInput } from '../schema';
import { FORM_THEME_PRESETS, type getFormToneClasses } from '../theme';
import type { FormResponseSummary } from '../types';
import { SettingsSection } from './settings-section';
import type { StudioForm } from './studio-utils';

/** Progress bar, submission limits, confirmation copy, and the theme summary. */
export function ExperienceSettingsSection({
  accessMode,
  allowMultipleSubmissions,
  bodyFontId,
  form,
  headlineFontId,
  oneResponseLimitLocked,
  oneResponsePerUser,
  responseSummary,
  showProgressBar,
  themePreset,
  toneClasses,
}: {
  accessMode: FormStudioInput['accessMode'];
  allowMultipleSubmissions: boolean;
  bodyFontId: FormStudioInput['theme']['bodyFontId'];
  form: StudioForm;
  headlineFontId: FormStudioInput['theme']['headlineFontId'];
  oneResponseLimitLocked: boolean;
  oneResponsePerUser: boolean;
  responseSummary: FormResponseSummary;
  showProgressBar: boolean;
  themePreset: string;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');

  const displayMode = useWatch({
    control: form.control,
    name: 'settings.displayMode',
  });
  const welcomeEnabled = useWatch({
    control: form.control,
    name: 'settings.welcomeEnabled',
  });

  return (
    <SettingsSection
      description={t('settings.responses_recorded')}
      icon={CircleCheckBig}
      title={t('settings.experience_controls')}
      value="experience-controls"
    >
      <div className="space-y-2">
        <Label>{t('settings.display_mode')}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['sections', 'one_question'] as const).map((candidate) => (
            <button
              className={cn(
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                candidate === displayMode
                  ? 'border-foreground/25 bg-foreground/[0.04]'
                  : 'border-border/60 bg-background/55 hover:border-foreground/20'
              )}
              key={candidate}
              onClick={() =>
                form.setValue('settings.displayMode', candidate, {
                  shouldDirty: true,
                })
              }
              type="button"
            >
              <span className="block font-medium text-sm">
                {t(`settings.display_modes.${candidate}`)}
              </span>
              <span className="mt-1 block text-muted-foreground text-xs">
                {t(`settings.display_mode_hints.${candidate}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
        <button
          className="flex w-full items-start gap-3 text-left"
          onClick={() =>
            form.setValue('settings.welcomeEnabled', !welcomeEnabled, {
              shouldDirty: true,
            })
          }
          type="button"
        >
          <Checkbox
            checked={welcomeEnabled}
            className="pointer-events-none mt-0.5"
            tabIndex={-1}
          />
          <span className="space-y-1">
            <span className="block font-medium text-sm">
              {t('settings.welcome_screen')}
            </span>
            <span className="block text-muted-foreground text-xs">
              {t('settings.welcome_screen_hint')}
            </span>
          </span>
        </button>

        {welcomeEnabled ? (
          <div className="space-y-3 border-border/50 border-t pt-3">
            <div className="space-y-2">
              <Label htmlFor="welcome-title">
                {t('settings.welcome_title')}
              </Label>
              <Input
                id="welcome-title"
                placeholder={t('settings.welcome_title_placeholder')}
                {...form.register('settings.welcomeTitle')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome-description">
                {t('settings.welcome_body')}
              </Label>
              <Textarea
                id="welcome-description"
                placeholder={t('settings.welcome_body_placeholder')}
                rows={3}
                {...form.register('settings.welcomeDescription')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome-button">
                {t('settings.welcome_button')}
              </Label>
              <Input
                id="welcome-button"
                placeholder={t('settings.welcome_button_placeholder')}
                {...form.register('settings.welcomeButtonLabel')}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('settings.responses_recorded')}
            </p>
            <p className="mt-1 font-semibold text-lg">
              {responseSummary.totalSubmissions}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('settings.responders')}
            </p>
            <p className="mt-1 font-semibold text-lg">
              {responseSummary.totalResponders}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('settings.repeat_users')}
            </p>
            <p className="mt-1 font-semibold text-lg">
              {responseSummary.duplicateAuthenticatedResponders}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
        <label
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3',
            toneClasses.optionCardClassName
          )}
        >
          <Checkbox
            className={toneClasses.checkboxClassName}
            checked={!!showProgressBar}
            onCheckedChange={(checked) =>
              form.setValue('settings.showProgressBar', checked === true, {
                shouldDirty: true,
              })
            }
          />
          <span className="text-sm">{t('settings.show_progress_bar')}</span>
        </label>

        <label
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3',
            toneClasses.optionCardClassName
          )}
        >
          <Checkbox
            className={toneClasses.checkboxClassName}
            checked={!!allowMultipleSubmissions}
            onCheckedChange={(checked) =>
              form.setValue(
                'settings.allowMultipleSubmissions',
                checked === true,
                {
                  shouldDirty: true,
                }
              )
            }
          />
          <span className="text-sm">
            {t('settings.allow_multiple_submissions')}
          </span>
        </label>

        <label
          className={cn(
            'flex items-start gap-3 rounded-2xl border px-4 py-3',
            oneResponseLimitLocked && 'cursor-not-allowed opacity-70',
            toneClasses.optionCardClassName
          )}
        >
          <Checkbox
            className={toneClasses.checkboxClassName}
            checked={!!oneResponsePerUser}
            disabled={oneResponseLimitLocked}
            onCheckedChange={(checked) =>
              form.setValue('settings.oneResponsePerUser', checked === true, {
                shouldDirty: true,
              })
            }
          />
          <div className="space-y-1">
            <span className="block text-sm">
              {t('settings.one_response_per_user')}
            </span>
            <span className="block text-muted-foreground text-xs">
              {t('settings.one_response_per_user_hint')}
            </span>
          </div>
        </label>
        {oneResponsePerUser && accessMode === 'anonymous' ? (
          <div className="rounded-2xl border border-dynamic-orange/35 bg-dynamic-orange/8 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full border border-dynamic-orange/35 bg-dynamic-orange/12 p-2 text-dynamic-orange">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-dynamic-orange text-sm">
                  {t('settings.anonymous_one_response_warning_title')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('settings.anonymous_one_response_warning_description')}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-dynamic-blue/25 bg-dynamic-blue/8 px-4 py-3">
          <p className="font-medium text-dynamic-blue text-sm">
            {t('settings.turnstile_always_on')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('settings.turnstile_always_on_hint')}
          </p>
        </div>
      </div>

      {responseSummary.hasMultipleSubmissionsByUser ? (
        <div className="rounded-2xl border border-dynamic-orange/35 bg-dynamic-orange/8 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-dynamic-orange/35 bg-dynamic-orange/12 p-2 text-dynamic-orange">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-dynamic-orange text-sm">
                {t('settings.one_response_warning_title')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('settings.one_response_warning_description', {
                  responders: responseSummary.duplicateAuthenticatedResponders,
                  submissions:
                    responseSummary.duplicateAuthenticatedSubmissions,
                })}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
        <div className="space-y-2">
          <Label>
            <FieldLabel icon={FileText}>
              {t('settings.confirmation_title')}
            </FieldLabel>
          </Label>
          <Input
            {...form.register('settings.confirmationTitle')}
            className={toneClasses.fieldClassName}
          />
        </div>
        <div className="space-y-2">
          <Label>
            <FieldLabel icon={MessageSquare}>
              {t('settings.confirmation_message')}
            </FieldLabel>
          </Label>
          <Textarea
            {...form.register('settings.confirmationMessage')}
            className={toneClasses.fieldClassName}
          />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            {t('settings.current_theme', {
              theme:
                FORM_THEME_PRESETS.find((preset) => preset.id === themePreset)
                  ?.name ?? '',
            })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('settings.current_fonts', {
              headline: getFormFontLabel(headlineFontId),
              body: getFormFontLabel(bodyFontId),
            })}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
