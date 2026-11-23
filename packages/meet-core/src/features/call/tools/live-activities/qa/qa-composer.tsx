'use client';

import { FileText, ImagePlus, Paperclip, Send, X } from '@tuturuuu/icons';
import {
  discardMeetChatFile,
  uploadMeetChatFile,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ToolIconAction } from '../../tool-ui';

const MAX_FILES = 4;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Upload = { id: string };

/**
 * A question or answer draft with up to four files. Files go to the room's
 * upload route on send, as chat files do, and only their ids reach the room.
 * Files uploaded for a draft that is never sent are withdrawn on unmount.
 */
export function QaComposer({
  meetingId,
  label,
  placeholder,
  submitLabel,
  maxLength,
  allowEmptyText = false,
  canAttach = true,
  leading,
  extra,
  autoFocus,
  compact = false,
  compactPlaceholder,
  onCancel,
  cancelLabel,
  onSubmit,
  onUploadError,
}: {
  meetingId: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  maxLength: number;
  /** Whether files alone may be sent, as for an answer. */
  allowEmptyText?: boolean;
  /** Guests cannot upload room files, so they get no attach actions. */
  canAttach?: boolean;
  leading?: ReactNode;
  extra?: ReactNode;
  autoFocus?: boolean;
  /**
   * A short pane gets one row: the field, Attach and Send always in view. The
   * layout depends on the pane's height alone, never on focus or on what is
   * typed, so nothing moves under a press.
   */
  compact?: boolean;
  /** A one-line prompt for the compact row, where the full one would wrap. */
  compactPlaceholder?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  onSubmit: (text: string, attachmentIds: string[]) => void;
  onUploadError: (reason: 'too_large' | 'upload_failed') => void;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  const textId = useId();
  const counterId = useId();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef(new Map<File, Upload>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const receipts = uploaded.current;
    return () => {
      mounted.current = false;
      for (const receipt of receipts.values())
        void discardMeetChatFile(meetingId, receipt.id).catch(() => undefined);
      receipts.clear();
    };
  }, [meetingId]);

  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.some((file) => file.size > MAX_FILE_BYTES))
      onUploadError('too_large');
    setFiles((current) =>
      [
        ...current,
        ...picked.filter((file) => file.size && file.size <= MAX_FILE_BYTES),
      ].slice(0, MAX_FILES)
    );
  };
  const ready =
    !busy && (!!draft.trim() || (allowEmptyText && files.length > 0));
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of files) {
        const receipt =
          uploaded.current.get(file) ??
          (await uploadMeetChatFile(meetingId, file));
        if (!mounted.current) {
          void discardMeetChatFile(meetingId, receipt.id).catch(
            () => undefined
          );
          return;
        }
        uploaded.current.set(file, receipt);
        ids.push(receipt.id);
      }
      onSubmit(draft.trim(), ids);
      uploaded.current.clear();
      setDraft('');
      setFiles([]);
    } catch {
      if (mounted.current) onUploadError('upload_failed');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const counter = (
    <span
      id={counterId}
      className={cn(
        'text-muted-foreground text-xs tabular-nums',
        compact ? 'sr-only' : 'ms-auto',
        draft.length >= maxLength && 'text-dynamic-orange'
      )}
    >
      <span aria-hidden="true" className={cn(compact && 'hidden')}>
        {draft.length}/{maxLength}
      </span>
      <span className="sr-only">
        {t('counter', { count: draft.length, max: maxLength })}
      </span>
    </span>
  );
  const chips = files.length ? (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-muted/40 ps-3 text-xs"
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{file.name}</span>
          <ToolIconAction
            icon={X}
            label={t('remove_file', { name: file.name })}
            className="size-8"
            disabled={busy}
            onClick={() =>
              setFiles((current) =>
                current.filter((_, position) => position !== index)
              )
            }
          />
        </li>
      ))}
    </ul>
  ) : null;
  const fileInputs = (
    <>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </>
  );
  const attach = canAttach ? (
    <>
      <ToolIconAction
        icon={ImagePlus}
        label={t('attach_image')}
        disabled={busy || files.length >= MAX_FILES}
        onClick={() => imageInput.current?.click()}
      />
      <ToolIconAction
        icon={Paperclip}
        label={t('attach_file')}
        disabled={busy || files.length >= MAX_FILES}
        onClick={() => fileInput.current?.click()}
      />
    </>
  ) : null;
  const field = (
    <Textarea
      id={textId}
      value={draft}
      maxLength={maxLength}
      rows={compact ? 1 : 2}
      autoFocus={autoFocus}
      placeholder={
        compact && compactPlaceholder ? compactPlaceholder : placeholder
      }
      aria-describedby={counterId}
      className={cn(
        'resize-none text-sm',
        // One line that grows with the text to three, then scrolls.
        compact ? 'max-h-[4.75rem] min-h-9 overflow-y-auto' : 'min-h-16'
      )}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // Enter sends; Shift+Enter adds a line. An IME composition keeps its
        // Enter for confirming the candidate (keyCode 229 covers Safari).
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        ) {
          event.preventDefault();
          void submit();
        }
        if (event.key === 'Escape' && onCancel) {
          event.stopPropagation();
          onCancel();
        }
      }}
    />
  );
  const labelNode = (
    <label htmlFor={textId} className="sr-only">
      {label}
    </label>
  );
  if (compact)
    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {chips}
        {extra}
        <div className="flex items-end gap-1">
          <div className="min-w-0 flex-1">
            {labelNode}
            {field}
          </div>
          {draft.length > maxLength * 0.8 && (
            <span
              aria-hidden="true"
              className={cn(
                'shrink-0 pb-2.5 text-muted-foreground text-xs tabular-nums',
                draft.length >= maxLength && 'text-dynamic-orange'
              )}
            >
              {draft.length}/{maxLength}
            </span>
          )}
          {attach}
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-full pointer-coarse:size-11"
            aria-label={submitLabel}
            disabled={!ready}
            aria-busy={busy || undefined}
          >
            <Send className="size-4" />
          </Button>
        </div>
        {counter}
        {fileInputs}
      </form>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-start gap-2.5">
        {leading}
        <div className="min-w-0 flex-1 space-y-2">
          {labelNode}
          {field}
          {chips}
        </div>
      </div>
      {fileInputs}
      <div className="flex flex-wrap items-center gap-1">
        {attach}
        {extra}
        {counter}
        {onCancel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 rounded-full pointer-coarse:h-11"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="h-9 gap-1.5 rounded-full px-4 pointer-coarse:h-11"
          disabled={!ready}
          aria-busy={busy || undefined}
        >
          <Send className="size-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
