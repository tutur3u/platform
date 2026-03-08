'use client';

import {
  AlertTriangle,
  CircleCheckBig,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
} from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

import { getFormFontLabel } from '../fonts';
import { FieldLabel } from '../form-icons';
import type { FORM_ACCESS_MODE_VALUES, FormStudioInput } from '../schema';
import { FORM_THEME_PRESETS, type getFormToneClasses } from '../theme';
import type { FormResponseSummary } from '../types';
import type { StudioForm } from './studio-utils';

export function SettingsPanel({
  form,
  shareCode,
  toneClasses,
  onOpenPreview,
  isDirty,
  responseSummary,
}: {
  form: StudioForm;
  shareCode?: string | null;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  onOpenPreview: () => void;
  isDirty: boolean;
  responseSummary: FormResponseSummary;
}) {
  const t = useTranslations('forms');
  const themePreset = useWatch({
    control: form.control,
    name: 'theme.presetId',
  });
  const headlineFontId = useWatch({
    control: form.control,
    name: 'theme.headlineFontId',
  });
  const bodyFontId = useWatch({
    control: form.control,
    name: 'theme.bodyFontId',
  });
  const status = useWatch({
    control: form.control,
    name: 'status',
  });
  const accessMode = useWatch({
    control: form.control,
    name: 'accessMode',
  });
  const openAt = useWatch({
    control: form.control,
    name: 'openAt',
  });
  const closeAt = useWatch({
    control: form.control,
    name: 'closeAt',
  });
  const maxResponses = useWatch({
    control: form.control,
    name: 'maxResponses',
  });
  const showProgressBar = useWatch({
    control: form.control,
    name: 'settings.showProgressBar',
  });
  const allowMultipleSubmissions = useWatch({
    control: form.control,
    name: 'settings.allowMultipleSubmissions',
  });
  const oneResponsePerUser = useWatch({
    control: form.control,
    name: 'settings.oneResponsePerUser',
  });
  const oneResponseLimitLocked =
    responseSummary.hasMultipleSubmissionsByUser && !oneResponsePerUser;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = shareCode ? `${origin}/shared/forms/${shareCode}` : '';
  const canOpenLiveForm = !!shareCode && status === 'published' && !isDirty;

  return (
    <Accordion
      type="multiple"
      defaultValue={['publishing-and-access', 'experience-controls']}
      className="space-y-4"
    >
      <AccordionItem
        value="publishing-and-access"
        className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 px-6 shadow-sm"
      >
        <AccordionTrigger className="py-5 hover:no-underline">
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-base">
                {t('settings.publishing_and_access')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('settings.share_link')}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="overflow-hidden pb-0">
          <div className="space-y-4 border-border/60 border-t pt-5 pb-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  <FieldLabel icon={ClipboardList}>
                    {t('settings.status')}
                  </FieldLabel>
                </Label>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    form.setValue(
                      'status',
                      value as FormStudioInput['status'],
                      {
                        shouldDirty: true,
                      }
                    )
                  }
                >
                  <SelectTrigger className={toneClasses.fieldClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('status.draft')}</SelectItem>
                    <SelectItem value="published">
                      {t('status.published')}
                    </SelectItem>
                    <SelectItem value="closed">{t('status.closed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  <FieldLabel icon={CircleCheckBig}>
                    {t('settings.responder_access')}
                  </FieldLabel>
                </Label>
                <Select
                  value={accessMode}
                  onValueChange={(value) =>
                    form.setValue(
                      'accessMode',
                      value as (typeof FORM_ACCESS_MODE_VALUES)[number],
                      {
                        shouldDirty: true,
                      }
                    )
                  }
                >
                  <SelectTrigger className={toneClasses.fieldClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anonymous">
                      {t('access_mode.anonymous')}
                    </SelectItem>
                    <SelectItem value="authenticated">
                      {t('access_mode.authenticated')}
                    </SelectItem>
                    <SelectItem value="authenticated_email">
                      {t('access_mode.authenticated_email')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.open_at')}</Label>
                <DateTimePicker
                  date={openAt ? new Date(openAt) : undefined}
                  setDate={(date) =>
                    form.setValue('openAt', date?.toISOString() ?? null, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.close_at')}</Label>
                <DateTimePicker
                  date={closeAt ? new Date(closeAt) : undefined}
                  setDate={(date) =>
                    form.setValue('closeAt', date?.toISOString() ?? null, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>
                  <FieldLabel icon={ClipboardList}>
                    {t('settings.maximum_responses')}
                  </FieldLabel>
                </Label>
                <Input
                  type="number"
                  className={toneClasses.fieldClassName}
                  placeholder={t('settings.unlimited')}
                  value={maxResponses ?? ''}
                  onChange={(event) =>
                    form.setValue(
                      'maxResponses',
                      event.target.value ? Number(event.target.value) : null,
                      {
                        shouldDirty: true,
                      }
                    )
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>
                  <FieldLabel icon={ExternalLink}>
                    {t('settings.share_link')}
                  </FieldLabel>
                </Label>
                <div className="rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={
                        shareCode
                          ? shareUrl
                          : t('settings.publish_to_create_share_link')
                      }
                      className={toneClasses.fieldClassName}
                      readOnly
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={toneClasses.secondaryButtonClassName}
                      onClick={onOpenPreview}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('settings.open_preview_tab')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={toneClasses.secondaryButtonClassName}
                      disabled={!canOpenLiveForm}
                      onClick={() => {
                        if (canOpenLiveForm) {
                          window.open(
                            shareUrl,
                            '_blank',
                            'noopener,noreferrer'
                          );
                        }
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('settings.open_live_form')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={toneClasses.secondaryButtonClassName}
                      disabled={!shareCode}
                      onClick={async () => {
                        if (!shareCode) return;
                        await navigator.clipboard.writeText(shareUrl);
                        toast.success(t('toast.share_link_copied'));
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {t('settings.copy_share_link')}
                    </Button>
                  </div>
                  <p className="mt-3 text-muted-foreground text-xs">
                    {isDirty
                      ? t('settings.live_form_save_hint')
                      : canOpenLiveForm
                        ? t('settings.live_form_hint')
                        : t('settings.live_form_publish_hint')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="experience-controls"
        className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 px-6 shadow-sm"
      >
        <AccordionTrigger className="py-5 hover:no-underline">
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground">
              <CircleCheckBig className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-base">
                {t('settings.experience_controls')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('settings.responses_recorded')}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="overflow-hidden pb-0">
          <div className="space-y-4 border-border/60 border-t pt-5 pb-5">
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
                    form.setValue(
                      'settings.showProgressBar',
                      checked === true,
                      {
                        shouldDirty: true,
                      }
                    )
                  }
                />
                <span className="text-sm">
                  {t('settings.show_progress_bar')}
                </span>
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
                    form.setValue(
                      'settings.oneResponsePerUser',
                      checked === true,
                      {
                        shouldDirty: true,
                      }
                    )
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
                        {t(
                          'settings.anonymous_one_response_warning_description'
                        )}
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
                        responders:
                          responseSummary.duplicateAuthenticatedResponders,
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
                      FORM_THEME_PRESETS.find(
                        (preset) => preset.id === themePreset
                      )?.name ?? '',
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
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
