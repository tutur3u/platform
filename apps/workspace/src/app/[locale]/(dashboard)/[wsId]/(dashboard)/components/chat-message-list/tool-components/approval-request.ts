import type { Renderer } from '@json-render/react';
import type { ComponentProps } from 'react';
import { isObjectRecord } from '../helpers';
import type { ApprovalRequestUiData } from '../types';

export function isApprovalRequestUiData(
  value: unknown
): value is ApprovalRequestUiData {
  if (!isObjectRecord(value)) return false;

  const hasValidTitleHint =
    value.titleHint === undefined ||
    value.titleHint === null ||
    typeof value.titleHint === 'string';
  const hasValidDescriptionHint =
    value.descriptionHint === undefined ||
    value.descriptionHint === null ||
    typeof value.descriptionHint === 'string';

  return (
    typeof value.startTime === 'string' &&
    typeof value.endTime === 'string' &&
    hasValidTitleHint &&
    hasValidDescriptionHint
  );
}

function toDateTimeLocalValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const pad = (num: number) => String(num).padStart(2, '0');

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function buildApprovalRequestSpec(
  t: (key: string, values?: Record<string, unknown>) => string,
  approval: ApprovalRequestUiData
): ComponentProps<typeof Renderer>['spec'] {
  const startTimeValue = toDateTimeLocalValue(approval.startTime);
  const endTimeValue = toDateTimeLocalValue(approval.endTime);
  const detailLine = t('approval_request.helper_time', {
    startTime: startTimeValue,
    endTime: endTimeValue,
  });
  const titleLine = approval.titleHint
    ? t('approval_request.helper_title', { title: approval.titleHint })
    : null;
  const helperText = titleLine ? `${detailLine}\n${titleLine}` : detailLine;

  return {
    root: 'approval-card',
    elements: {
      'approval-card': {
        type: 'Card',
        props: {
          title: t('approval_request.card_title'),
          description: t('approval_request.card_description'),
        },
        children: ['approval-help', 'request-form'],
      },
      'approval-help': {
        type: 'Text',
        props: {
          content: helperText,
          variant: 'small',
          color: 'muted',
        },
      },
      'request-form': {
        type: 'Form',
        props: {
          title: t('approval_request.form_title'),
          description: t('approval_request.form_description'),
          submitLabel: t('approval_request.form_submit'),
          submitAction: 'create_time_tracking_request',
          submitParams: {
            title: approval.titleHint ?? '',
            description: approval.descriptionHint ?? '',
            startTime: startTimeValue,
            endTime: endTimeValue,
          },
        },
        children: [
          'request-title',
          'request-description',
          'request-start',
          'request-end',
          'request-attachments',
        ],
      },
      'request-title': {
        type: 'Input',
        props: {
          name: 'title',
          label: t('approval_request.title_label'),
          placeholder: t('approval_request.title_placeholder'),
          required: true,
          value: approval.titleHint ?? '',
        },
      },
      'request-description': {
        type: 'Textarea',
        props: {
          name: 'description',
          label: t('approval_request.description_label'),
          placeholder: t('approval_request.description_placeholder'),
          rows: 3,
          value: approval.descriptionHint ?? '',
        },
      },
      'request-start': {
        type: 'Input',
        props: {
          name: 'startTime',
          label: t('approval_request.start_label'),
          placeholder: t('approval_request.start_placeholder'),
          type: 'datetime-local',
          required: true,
          value: startTimeValue,
        },
      },
      'request-end': {
        type: 'Input',
        props: {
          name: 'endTime',
          label: t('approval_request.end_label'),
          placeholder: t('approval_request.end_placeholder'),
          type: 'datetime-local',
          required: true,
          value: endTimeValue,
        },
      },
      'request-attachments': {
        type: 'FileAttachmentInput',
        props: {
          name: 'attachments',
          label: t('approval_request.attachments_label'),
          description: t('approval_request.attachments_description'),
          required: true,
          maxFiles: 5,
          accept: 'image/*',
        },
      },
    },
  };
}
