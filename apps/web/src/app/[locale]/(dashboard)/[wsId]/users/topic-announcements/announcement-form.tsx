'use client';

import { BookmarkPlus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementAttachmentDraft,
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
  TopicAnnouncementRecord,
  TopicAnnouncementTemplateRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AnnouncementFormDetailsStep } from './announcement-form-details-step';
import { AnnouncementFormMessageStep } from './announcement-form-message-step';
import { AnnouncementFormReviewStep } from './announcement-form-review-step';
import {
  ANNOUNCEMENT_STEPS,
  type AnnouncementDeliveryMode,
  type AnnouncementStep,
  buildTopicAnnouncementPayload,
  createAnnouncementFormFromRecord,
  createDefaultScheduledDate,
  getAnnouncementStepValidity,
  INITIAL_ANNOUNCEMENT_FORM,
} from './announcement-form-state';
import {
  AnnouncementStepIndicator,
  AnnouncementWizardFooter,
} from './announcement-form-stepper';
import { AnnouncementRecipientsPicker } from './announcement-recipients-picker';
import { AnnouncementSaveTemplateDialog } from './announcement-save-template-dialog';
import type { TemplateFormValues } from './template-form-dialog';

interface Props {
  canSend: boolean;
  contacts: TopicAnnouncementContact[];
  groups: UserGroup[];
  forkSeedId?: number | null;
  forkSource?: TopicAnnouncementRecord | null;
  isCreating: boolean;
  isSavingTemplate: boolean;
  isScheduling: boolean;
  isSending: boolean;
  onCreate: (payload: TopicAnnouncementPayload) => Promise<void>;
  onCreateAndSchedule: (
    payload: TopicAnnouncementPayload,
    scheduledSendAt: string
  ) => Promise<void>;
  onCreateAndSend: (payload: TopicAnnouncementPayload) => Promise<void>;
  onSaveTemplate: (values: TemplateFormValues) => void;
  onTimezoneRequired: () => void;
  onUploadAttachment: (file: File) => Promise<TopicAnnouncementAttachmentDraft>;
  schedulingTimezone: string | null;
  templates: TopicAnnouncementTemplateRecord[];
  workspaceUsers: WorkspaceBasicUserRecord[];
}

export function AnnouncementForm({
  canSend,
  contacts,
  forkSeedId = null,
  forkSource = null,
  groups,
  isCreating,
  isSavingTemplate,
  isScheduling,
  isSending,
  onCreate,
  onCreateAndSchedule,
  onCreateAndSend,
  onSaveTemplate,
  onTimezoneRequired,
  onUploadAttachment,
  schedulingTimezone,
  templates,
  workspaceUsers,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [deliveryMode, setDeliveryMode] =
    useState<AnnouncementDeliveryMode>('draft');
  const [form, setForm] = useState(INITIAL_ANNOUNCEMENT_FORM);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(
    createDefaultScheduledDate
  );
  const [step, setStep] = useState<AnnouncementStep>('details');
  const validSteps = useMemo(() => getAnnouncementStepValidity(form), [form]);
  const currentStepIndex = ANNOUNCEMENT_STEPS.indexOf(step);
  const isSubmitting = isCreating || isSending || isScheduling;
  const isLastStep = step === 'review';
  const canUseDeliveryMode = deliveryMode === 'draft' || canSend;
  const canSubmit =
    validSteps.review &&
    canUseDeliveryMode &&
    (deliveryMode !== 'schedule' || Boolean(scheduledAt && schedulingTimezone));
  const submitLabel = getSubmitLabel(deliveryMode, t);

  useEffect(() => {
    if (!forkSeedId || !forkSource) return;

    setDeliveryMode('draft');
    setForm(createAnnouncementFormFromRecord(forkSource));
    setScheduledAt(createDefaultScheduledDate());
    setStep('details');
  }, [forkSeedId, forkSource]);

  const resetForm = () => {
    setDeliveryMode('draft');
    setForm(INITIAL_ANNOUNCEMENT_FORM);
    setScheduledAt(createDefaultScheduledDate());
    setStep('details');
  };

  const submit = async () => {
    if (!canSubmit || isSubmitting) return;
    if (deliveryMode === 'schedule' && !schedulingTimezone) {
      onTimezoneRequired();
      return;
    }

    const payload = buildTopicAnnouncementPayload(form);

    try {
      if (deliveryMode === 'send') {
        await onCreateAndSend(payload);
      } else if (deliveryMode === 'schedule' && scheduledAt) {
        await onCreateAndSchedule(payload, scheduledAt.toISOString());
      } else {
        await onCreate(payload);
      }
      resetForm();
    } catch {
      // Mutation handlers already surface errors through toasts; keep the draft.
    }
  };

  return (
    <Card className="bg-background">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold text-xl tracking-tight">
              {t('create_announcement')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('create_announcement_helper')}
            </p>
          </div>
          <Button
            className="gap-2"
            disabled={isSubmitting || !form.title.trim()}
            onClick={() => setSaveTemplateOpen(true)}
            type="button"
            variant="outline"
          >
            <BookmarkPlus className="h-4 w-4" />
            {t('save_as_template')}
          </Button>
        </div>

        <AnnouncementStepIndicator
          currentStep={step}
          onSelectStep={setStep}
          steps={ANNOUNCEMENT_STEPS}
          validSteps={validSteps}
        />

        {step === 'details' ? (
          <AnnouncementFormDetailsStep
            form={form}
            groups={groups}
            isDisabled={isSubmitting}
            setForm={setForm}
            templates={templates}
          />
        ) : null}

        {step === 'message' ? (
          <AnnouncementFormMessageStep
            disabled={isSubmitting}
            form={form}
            onUploadAttachment={onUploadAttachment}
            setForm={setForm}
          />
        ) : null}

        {step === 'recipients' ? (
          <div className="space-y-3 rounded-md border bg-background p-4">
            <div>
              <h3 className="font-medium text-base">{t('recipients')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('recipients_section_helper')}
              </p>
            </div>
            <AnnouncementRecipientsPicker
              contacts={contacts}
              onChange={(contactIds) =>
                setForm((current) => ({ ...current, contactIds }))
              }
              selectedIds={form.contactIds}
              workspaceUsers={workspaceUsers}
            />
          </div>
        ) : null}

        {step === 'review' ? (
          <AnnouncementFormReviewStep
            canSend={canSend}
            contacts={contacts}
            deliveryMode={deliveryMode}
            form={form}
            groups={groups}
            onTimezoneRequired={onTimezoneRequired}
            scheduledAt={scheduledAt}
            schedulingTimezone={schedulingTimezone}
            setDeliveryMode={setDeliveryMode}
            setScheduledAt={setScheduledAt}
          />
        ) : null}

        <AnnouncementWizardFooter
          canContinue={validSteps[step]}
          canSubmit={canSubmit}
          isFirstStep={step === 'details'}
          isLastStep={isLastStep}
          isSubmitting={isSubmitting}
          onBack={() =>
            setStep(
              ANNOUNCEMENT_STEPS[Math.max(0, currentStepIndex - 1)] ?? 'details'
            )
          }
          onNext={() =>
            setStep(
              ANNOUNCEMENT_STEPS[
                Math.min(ANNOUNCEMENT_STEPS.length - 1, currentStepIndex + 1)
              ] ?? 'review'
            )
          }
          onSubmit={submit}
          submitLabel={submitLabel}
        />
      </CardContent>

      <AnnouncementSaveTemplateDialog
        form={form}
        groups={groups}
        isOpen={saveTemplateOpen}
        isSaving={isSavingTemplate}
        onClose={() => setSaveTemplateOpen(false)}
        onSaveTemplate={onSaveTemplate}
      />
    </Card>
  );
}

function getSubmitLabel(
  deliveryMode: AnnouncementDeliveryMode,
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>
) {
  if (deliveryMode === 'send') return t('announcement_submit_send');
  if (deliveryMode === 'schedule') return t('announcement_submit_schedule');
  return t('announcement_submit_draft');
}
