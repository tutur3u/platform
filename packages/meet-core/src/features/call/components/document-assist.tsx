'use client';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from '@tuturuuu/icons';
import {
  assistMeetDocument,
  type MeetingDocumentAssistInput,
} from '@tuturuuu/internal-api/meet-call';
import type { Awareness } from '@tuturuuu/realtime/documents';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { MiraMark } from './mira-mark';
import {
  type DocumentNode,
  miraTextToContent,
  sectionAt,
} from './document-mira-edit';

type Mode = MeetingDocumentAssistInput['mode'];
/** The editor surface Mira needs: selection, document and insertion. */
export type MiraAssistEditor = {
  state: {
    doc: DocumentNode & {
      textBetween: (from: number, to: number, separator: string) => string;
      content: { size: number };
    };
    selection: { from: number; to: number };
  };
  chain: () => {
    focus: () => {
      insertContentAt: (
        range: number | { from: number; to: number },
        content: unknown
      ) => { run: () => boolean };
    };
  };
};
export type MiraInsertion = {
  editId: string;
  mode: Mode;
  before: string;
  after: string;
};
type Target = Pick<MeetingDocumentAssistInput, 'text' | 'section' | 'cursor'>;

const failureKeys = {
  MIRA_CONSENT_REQUIRED: 'mira_consent_required',
  MIRA_CREDITS_UNAVAILABLE: 'mira_credits_unavailable',
  MIRA_ACCOUNT_UNAVAILABLE: 'mira_unavailable',
  MIRA_WORKSPACE_UNAVAILABLE: 'mira_unavailable',
  MIRA_DEPLOYMENT_DISABLED: 'mira_unavailable',
  MIRA_PROVIDER_UNAVAILABLE: 'mira_unavailable',
} as const;
function failureKey(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' && Object.hasOwn(failureKeys, code)
    ? failureKeys[code as keyof typeof failureKeys]
    : 'mira_failed';
}

function captureTarget(
  editor: MiraAssistEditor,
  awareness: Awareness | null
): Target {
  const { doc, selection } = editor.state;
  const selected = doc.textBetween(selection.from, selection.to, '\n');
  const text = (
    selected.trim()
      ? selected
      : doc.textBetween(
          Math.max(0, selection.from - 4000),
          selection.from,
          '\n'
        )
  ).slice(-8000);
  const cursor = awareness?.getLocalState()?.cursor;
  return {
    text,
    section: sectionAt(doc, selection.from),
    cursor:
      cursor && typeof cursor === 'object' && 'anchor' in cursor
        ? (cursor as Target['cursor'])
        : undefined,
  };
}

export function DocumentAssist({
  meetingId,
  tabId,
  editor,
  awareness,
  onInserted,
}: {
  meetingId: string;
  tabId: string;
  editor: () => MiraAssistEditor | null;
  awareness: Awareness | null;
  onInserted: (insertion: MiraInsertion) => void;
}) {
  const t = useTranslations('meet.collaboration');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('refine');
  const [instruction, setInstruction] = useState('');
  const target = useRef<Target | null>(null);
  const assist = useMutation({
    mutationFn: (input: { mode: Mode; target: Target }) =>
      assistMeetDocument(meetingId, {
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
        tabId,
        mode: input.mode,
        instruction: instruction.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...input.target,
        text: input.mode === 'summarize' ? summaryText() : input.target.text,
      }),
    onSuccess: (result, input) => {
      const current = editor();
      if (current) {
        const { from, to } = current.state.selection;
        current
          .chain()
          .focus()
          .insertContentAt(
            input.mode === 'refine' ? { from, to } : to,
            miraTextToContent(result.text)
          )
          .run();
      }
      onInserted({
        editId: result.editId,
        mode: input.mode,
        before: input.target.text,
        after: result.text,
      });
      setInstruction('');
      target.current = null;
      setOpen(false);
    },
  });
  function summaryText() {
    const doc = editor()?.state.doc;
    return doc ? doc.textBetween(0, doc.content.size, '\n').slice(0, 8000) : '';
  }
  const modes: Mode[] = ['refine', 'draft', 'summarize'];
  const needsSelection = mode === 'refine' && !target.current?.text.trim();
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (assist.isPending) return;
        // Keyboard activation has no pointerdown, so capture on open as well.
        if (next && !target.current) {
          const current = editor();
          target.current = current ? captureTarget(current, awareness) : null;
        }
        if (!next) {
          target.current = null;
          assist.reset();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="rounded-full px-2.5 font-extrabold text-dynamic-purple hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
          onPointerDown={() => {
            const current = editor();
            target.current = current ? captureTarget(current, awareness) : null;
          }}
        >
          <Sparkles className="size-4" />
          {t('ask_mira')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-[18px] p-3">
        <div className="mb-3 flex items-center gap-2">
          <MiraMark size={24} className="rounded-lg" />
          <p className="font-extrabold text-sm">{t('ask_mira')}</p>
        </div>
        <div
          role="radiogroup"
          aria-label={t('mira_action')}
          className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-muted p-1"
        >
          {modes.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'h-7 rounded-full font-bold text-muted-foreground text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                mode === value && 'bg-card text-foreground shadow-sm'
              )}
            >
              {t(`mira_mode_${value}`)}
            </button>
          ))}
        </div>
        <Textarea
          aria-label={t('mira_instruction')}
          placeholder={t('mira_instruction_placeholder')}
          value={instruction}
          maxLength={500}
          rows={3}
          onChange={(event) => setInstruction(event.target.value)}
          className="mb-2 resize-none rounded-xl"
        />
        {(needsSelection || assist.isError) && (
          <p role="alert" className="mb-2 text-destructive text-xs">
            {needsSelection
              ? t('mira_select_text')
              : t(failureKey(assist.error))}
          </p>
        )}
        <Button
          className="w-full rounded-full"
          disabled={assist.isPending || needsSelection}
          onClick={() =>
            assist.mutate({
              mode,
              target: target.current ?? { text: '' },
            })
          }
        >
          {assist.isPending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {assist.isPending ? t('mira_working') : t('mira_run')}
        </Button>
        <p className="mt-2 text-muted-foreground text-xs">
          {t('mira_private_note')}
        </p>
      </PopoverContent>
    </Popover>
  );
}
