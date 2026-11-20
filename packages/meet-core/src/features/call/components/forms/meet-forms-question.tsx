'use client';

import { Button } from '@tuturuuu/ui/button';
import { RespondentChoice } from '@tuturuuu/ui/forms/respondent-choice';
import { RespondentRanking } from '@tuturuuu/ui/forms/respondent-ranking';
import { Input } from '@tuturuuu/ui/input';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useId } from 'react';
import type { MeetFormsCopy } from './meet-forms-copy';
import { isContent, plainFormText } from './respondent-flow';
import type {
  MeetFormsAnswer,
  MeetFormsImage,
  MeetFormsOption,
  MeetFormsQuestion,
} from './types';

export function FormText({ text }: { text: string }) {
  const source = /<\/?[a-z][^>]*>/i.test(text)
    ? text
        .replace(/<\/?(?:p|div|li|h[1-6]|br)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
    : text;
  return (
    <div className="min-w-0 wrap-anywhere [&_a]:underline [&_pre]:overflow-auto">
      <MemoizedReactMarkdown skipHtml>{source}</MemoizedReactMarkdown>
    </div>
  );
}

export function FormImage({ image }: { image?: MeetFormsImage | null }) {
  if (!image || !/^https:\/\/|^\/(?!\/|\\)/i.test(image.url)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Storage images can have dynamically signed URLs.
    <img
      src={image.url}
      alt={image.alt ?? ''}
      className="max-h-64 max-w-full rounded-md object-contain"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

interface MeetFormsQuestionProps {
  question: MeetFormsQuestion;
  value: MeetFormsAnswer | undefined;
  onChange: (value: MeetFormsAnswer) => void;
  disabled: boolean;
  error?: string;
  gated: boolean;
  upload:
    | { kind: 'unavailable' | 'pending' }
    | { kind: 'available'; error: boolean; onSelect: (files: File[]) => void };
  copy: MeetFormsCopy;
}

export function MeetFormsQuestionField(props: MeetFormsQuestionProps) {
  const { question, error, copy } = props;
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  if (question.type === 'divider' || question.type === 'section_break') {
    return <hr className="border-border" />;
  }

  const describedBy =
    [question.description && descriptionId, error && errorId]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div
      className="min-w-0 space-y-2"
      data-question-id={question.id}
      data-question-invalid={error ? true : undefined}
    >
      <div id={labelId} className="font-medium text-sm">
        <FormText text={question.title} />
        {question.required && !isContent(question) && (
          <span className="text-muted-foreground text-xs">{copy.required}</span>
        )}
      </div>
      <FormImage image={question.image} />
      {question.description && (
        <div id={descriptionId} className="text-muted-foreground text-sm">
          <FormText text={question.description} />
        </div>
      )}
      <QuestionControl {...props} labelId={labelId} describedBy={describedBy} />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

type ControlProps = MeetFormsQuestionProps & {
  labelId: string;
  describedBy?: string;
};

function QuestionControl({
  question,
  value,
  onChange,
  disabled,
  error,
  gated,
  upload,
  copy,
  labelId,
  describedBy,
}: ControlProps) {
  if (gated) {
    return (
      <p className="text-muted-foreground text-sm">
        {question.type === 'file_upload'
          ? copy.unavailableUpload
          : copy.unavailableMatrix}
      </p>
    );
  }
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const list = Array.isArray(value) ? value : [];
  const options = question.options ?? [];
  const settings = 'settings' in question ? question.settings : undefined;
  const a11y = {
    'aria-labelledby': labelId,
    'aria-describedby': describedBy,
    'aria-invalid': Boolean(error),
    'aria-required': question.required,
  };
  const choiceProps = {
    labelledBy: labelId,
    describedBy,
    disabled,
    required: question.required,
    invalid: Boolean(error),
  };
  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice': {
      const choices = options.map((option) => ({
        value: option.value,
        label: (
          <span className="grid gap-1">
            {plainFormText(option.label)}
            <FormImage image={option.image} />
          </span>
        ),
      }));
      return question.type === 'single_choice' ? (
        <RespondentChoice
          {...choiceProps}
          options={choices}
          value={text}
          onChange={onChange}
        />
      ) : (
        <RespondentChoice
          {...choiceProps}
          options={choices}
          multiple
          value={list}
          onChange={onChange}
        />
      );
    }
    case 'dropdown':
      return (
        <FormSelect
          {...a11y}
          options={options}
          value={text}
          onChange={onChange}
          disabled={disabled}
          placeholder={settings?.placeholder || copy.select}
        />
      );
    case 'long_text':
      return (
        <Textarea
          {...a11y}
          value={text}
          disabled={disabled}
          placeholder={settings?.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'short_text':
    case 'email':
    case 'phone':
    case 'number':
    case 'url':
    case 'date':
    case 'time':
      return (
        <Input
          {...a11y}
          type={
            question.type === 'short_text'
              ? 'text'
              : question.type === 'phone'
                ? 'tel'
                : question.type
          }
          value={text}
          disabled={disabled}
          placeholder={settings?.placeholder ?? undefined}
          min={
            question.type === 'number'
              ? (settings?.validationMin ?? undefined)
              : undefined
          }
          max={
            question.type === 'number'
              ? (settings?.validationMax ?? undefined)
              : undefined
          }
          step={
            question.type === 'number'
              ? (settings?.numberStep ?? 'any')
              : undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'rating':
    case 'linear_scale':
    case 'nps': {
      const min = question.type === 'nps' ? 0 : (settings?.scaleMin ?? 1);
      const max =
        question.type === 'nps'
          ? 10
          : question.type === 'rating'
            ? (settings?.ratingMax ?? 5)
            : (settings?.scaleMax ?? 5);
      const scale =
        question.type === 'nps'
          ? []
          : options.filter((option) => Number.isFinite(Number(option.value)));
      const fallback = Array.from(
        { length: Math.max(0, Math.min(11, max - min + 1)) },
        (_, index) => ({
          value: String(min + index),
          label: String(min + index),
        })
      );
      return (
        <div className="space-y-2">
          <RespondentChoice
            {...choiceProps}
            options={scale.length ? scale : fallback}
            value={text}
            onChange={onChange}
            compact
          />
          {(settings?.minLabel || settings?.maxLabel) && (
            <div className="flex justify-between gap-2 text-muted-foreground text-xs">
              <span>{settings.minLabel}</span>
              <span>{settings.maxLabel}</span>
            </div>
          )}
        </div>
      );
    }
    case 'ranking':
      return (
        <RespondentRanking
          {...choiceProps}
          options={options.map((option) => ({
            ...option,
            label: plainFormText(option.label),
          }))}
          value={list}
          onChange={onChange}
          moveUp={copy.moveUp}
          moveDown={copy.moveDown}
          confirmOrder={copy.confirmOrder}
        />
      );
    case 'matrix': {
      const selection =
        value && typeof value === 'object' && !Array.isArray(value)
          ? value
          : {};
      return (
        <div
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          role="group"
          className="grid gap-2"
        >
          {question.rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-1 rounded-md border border-border p-2 text-sm"
            >
              <span>{plainFormText(row.label)}</span>
              <FormSelect
                aria-label={plainFormText(row.label)}
                aria-required={question.required}
                value={
                  Object.hasOwn(selection, row.id)
                    ? (selection[row.id] ?? '')
                    : ''
                }
                onChange={(selected) =>
                  onChange({ ...selection, [row.id]: selected })
                }
                options={question.columns.map((column) => ({
                  value: column.id,
                  label: column.label,
                }))}
                placeholder={copy.select}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      );
    }
    case 'file_upload': {
      const count = list.length;
      if (upload.kind === 'unavailable') {
        return (
          <p className="text-muted-foreground text-sm">
            {copy.unavailableUpload}
          </p>
        );
      }
      return (
        <div className="space-y-2">
          <Input
            {...a11y}
            type="file"
            accept={question.accept}
            multiple={question.multiple}
            disabled={disabled || upload.kind !== 'available'}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (upload.kind === 'available' && files.length)
                upload.onSelect(files);
            }}
          />
          {upload.kind === 'pending' && <p role="status">{copy.upload}</p>}
          {upload.kind === 'available' && upload.error && (
            <p role="alert" className="text-destructive text-sm">
              {copy.uploadError}
            </p>
          )}
          {count > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span role="status">{copy.attached(count)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(null)}
              >
                {copy.removeFiles}
              </Button>
            </div>
          )}
        </div>
      );
    }
    case 'youtube': {
      const video = settings?.youtubeVideoId;
      if (!video || !/^[\w-]{11}$/.test(video)) return null;
      return (
        <iframe
          className="aspect-video w-full rounded-md border border-border"
          title={plainFormText(question.title)}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          src={`https://www.youtube-nocookie.com/embed/${video}?start=${settings.youtubeStartSeconds ?? 0}`}
        />
      );
    }
    case 'section_break':
    case 'divider':
    case 'rich_text':
    case 'image':
      return null;
  }
}

function FormSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  ...a11y
}: {
  options: MeetFormsOption[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger {...a11y}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options
          .filter((option) => option.value !== '')
          .map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {plainFormText(option.label)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
