'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FEE_NOTICE_PLACEHOLDERS,
  validateFeeNoticeTemplate,
} from '@tuturuuu/finance-core/fee-lock';
import {
  type FeeNoticePreviewResponse,
  type FeeNoticeTemplateInput,
  getFeeNoticeTemplate,
  previewFeeNotice,
  saveFeeNoticeTemplate,
} from '@tuturuuu/internal-api/finance-fee-lock';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRef, useState } from 'react';

/** Copy keyed like the design's `ws-fee-lock` keys (§2.3); the page maps them to `t(key)`. */
export interface FeeNoticeTemplateLabels {
  template_body: string;
  payment_line: string;
  item_format: string;
  item_separator: string;
  grouping: string;
  grouping_combined: string;
  grouping_per_class: string;
  placeholders: string;
  unknown_placeholder: (name: string) => string;
  preview: string;
  versions: string;
  restore_version: string;
  template_saved: string;
  conflict_body: string;
  save: string;
}

interface Props {
  wsId: string;
  /** manage_finance; without it the tab is read-only. */
  canEdit: boolean;
  /** A locked fee to preview against; the built-in sample otherwise. */
  previewLockId?: string;
  labels: FeeNoticeTemplateLabels;
}

type Form = FeeNoticeTemplateInput & { version: number | null };
const FIELDS = ['payment_line', 'item_format', 'item_separator'] as const;
const toForm = (row: Form): Form => ({
  version: row.version,
  body: row.body,
  item_format: row.item_format,
  item_separator: row.item_separator,
  payment_line: row.payment_line,
  notice_grouping: row.notice_grouping,
  locale: row.locale,
});

/** "Mẫu thông báo": placeholders are allowlisted; output is plain text only. */
export function FeeNoticeTemplateEditor({
  wsId,
  canEdit,
  previewLockId,
  labels,
}: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['fee-notice-template', wsId];
  const { data } = useQuery({
    queryKey,
    queryFn: () => getFeeNoticeTemplate(wsId),
  });
  const [form, setForm] = useState<Form | null>(null);
  const [restoredFrom, setRestoredFrom] = useState<number>();
  const [preview, setPreview] = useState<FeeNoticePreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const current = form ?? data?.template;
  if (!current) return null;
  const { version, ...fields } = current;
  const issues = validateFeeNoticeTemplate(fields);
  const update = (patch: Partial<Form>) => setForm({ ...current, ...patch });

  const insert = (name: string) => {
    const at = body.current?.selectionStart ?? fields.body.length;
    update({
      body: `${fields.body.slice(0, at)}{{${name}}}${fields.body.slice(at)}`,
    });
  };
  const runPreview = async () =>
    setPreview(
      await previewFeeNotice(wsId, { lockId: previewLockId, template: fields })
    );
  const save = async () => {
    setError(null);
    const result = await saveFeeNoticeTemplate(wsId, {
      ...fields,
      expected_version: data?.template.version ?? undefined,
      restored_from: restoredFrom,
    });
    if (!result.ok) {
      setError(labels.conflict_body);
      return;
    }
    toast.success(labels.template_saved);
    setForm(null);
    setRestoredFrom(undefined);
    await queryClient.invalidateQueries({ queryKey });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-3">
        <Label htmlFor="fee-notice-body">{labels.template_body}</Label>
        <Textarea
          id="fee-notice-body"
          ref={body}
          rows={6}
          value={fields.body}
          disabled={!canEdit}
          onChange={(e) => update({ body: e.target.value })}
        />
        <fieldset
          className="m-0 flex flex-wrap gap-1 border-0 p-0"
          aria-label={labels.placeholders}
        >
          {FEE_NOTICE_PLACEHOLDERS.body.map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => insert(name)}
            >
              {`{{${name}}}`}
            </Button>
          ))}
        </fieldset>
        {FIELDS.map((field) => (
          <div key={field} className="grid gap-1">
            <Label htmlFor={`fee-notice-${field}`}>{labels[field]}</Label>
            <Input
              id={`fee-notice-${field}`}
              value={fields[field]}
              disabled={!canEdit}
              onChange={(e) => update({ [field]: e.target.value })}
            />
          </div>
        ))}
        <Label>{labels.grouping}</Label>
        <RadioGroup
          value={fields.notice_grouping}
          disabled={!canEdit}
          onValueChange={(value) =>
            update({
              notice_grouping: value === 'per_class' ? 'per_class' : 'combined',
            })
          }
        >
          {(['combined', 'per_class'] as const).map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`fee-notice-${value}`} value={value} />
              <Label htmlFor={`fee-notice-${value}`}>
                {labels[`grouping_${value}`]}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {[
          ...issues.flatMap((i) =>
            i.code === 'unknown_placeholder'
              ? [labels.unknown_placeholder(i.name)]
              : []
          ),
          ...(error ? [error] : []),
        ].map((message) => (
          <p key={message} role="alert" className="text-dynamic-red text-sm">
            {message}
          </p>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runPreview}
            disabled={issues.length > 0}
          >
            {labels.preview}
          </Button>
          {canEdit && (
            <Button type="button" onClick={save} disabled={issues.length > 0}>
              {labels.save}
            </Button>
          )}
        </div>
      </div>
      <div className="grid content-start gap-3">
        {/* Plain text in a text node (whitespace kept); never HTML. */}
        {preview?.notices.map((notice) => (
          <p
            key={notice.group_id ?? 'combined'}
            data-testid="fee-notice-preview"
            className="whitespace-pre-wrap rounded-md border p-3 text-sm"
          >
            {notice.text}
          </p>
        ))}
        <p className="font-medium text-sm">{labels.versions}</p>
        {data?.versions.map((row) => (
          <div
            key={row.version}
            className="flex items-center justify-between text-sm"
          >
            <span>{`v${row.version}${version === row.version ? ' •' : ''}`}</span>
            {canEdit && !row.is_active && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(toForm(row));
                  setRestoredFrom(row.version);
                }}
              >
                {labels.restore_version}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
