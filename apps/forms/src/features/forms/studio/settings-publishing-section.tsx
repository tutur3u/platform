'use client';

import {
  CircleCheckBig,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
import { useTranslations } from 'next-intl';
import { FieldLabel } from '../form-icons';
import type { FORM_ACCESS_MODE_VALUES, FormStudioInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { SettingsSection } from './settings-section';
import type { StudioForm } from './studio-utils';

/** Status, access mode, scheduling, response cap, and the public share link. */
export function PublishingSettingsSection({
  accessMode,
  canOpenLiveForm,
  closeAt,
  form,
  isDirty,
  maxResponses,
  onOpenPreview,
  openAt,
  shareCode,
  shareUrl,
  status,
  toneClasses,
}: {
  accessMode: FormStudioInput['accessMode'];
  canOpenLiveForm: boolean;
  closeAt: FormStudioInput['closeAt'];
  form: StudioForm;
  isDirty: boolean;
  maxResponses: FormStudioInput['maxResponses'];
  onOpenPreview: () => void;
  openAt: FormStudioInput['openAt'];
  shareCode?: string | null;
  shareUrl: string;
  status: FormStudioInput['status'];
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');

  return (
    <SettingsSection
      description={t('settings.share_link')}
      icon={ExternalLink}
      title={t('settings.publishing_and_access')}
      value="publishing-and-access"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>
            <FieldLabel icon={ClipboardList}>{t('settings.status')}</FieldLabel>
          </Label>
          <Select
            value={status}
            onValueChange={(value) =>
              form.setValue('status', value as FormStudioInput['status'], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger className={toneClasses.fieldClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t('status.draft')}</SelectItem>
              <SelectItem value="published">{t('status.published')}</SelectItem>
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
                    window.open(shareUrl, '_blank', 'noopener,noreferrer');
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
    </SettingsSection>
  );
}
