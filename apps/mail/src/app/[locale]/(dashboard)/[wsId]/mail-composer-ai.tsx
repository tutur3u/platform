'use client';

import { useMutation } from '@tanstack/react-query';
import { Bot, Loader2 } from '@tuturuuu/icons';
import {
  type GenerateMailAiDraftResponse,
  generateMailAiDraft,
  type MailAiDraftMode,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function MailComposerAi({
  bodyHtml,
  bodyText,
  mailboxId,
  onApply,
  recipients,
  subject,
  threadId,
  workspaceId,
}: {
  bodyHtml: string;
  bodyText: string;
  mailboxId: string;
  onApply: (result: GenerateMailAiDraftResponse) => void;
  recipients: string[];
  subject: string;
  threadId?: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MailAiDraftMode>(
    threadId ? 'follow_up' : 'draft'
  );
  const [instructions, setInstructions] = useState('');
  const [result, setResult] = useState<GenerateMailAiDraftResponse | null>(
    null
  );
  const generation = useMutation({
    mutationFn: () =>
      generateMailAiDraft(workspaceId, mailboxId, {
        bodyHtml,
        bodyText,
        instructions,
        mode,
        recipients,
        subject,
        threadId,
      }),
    onSuccess: setResult,
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          <Bot className="size-4" /> {t('write_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-dynamic border-b px-5 py-4">
          <DialogTitle>{t('ai_compose_title')}</DialogTitle>
          <DialogDescription>{t('ai_compose_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-5">
          <Tabs
            onValueChange={(value) => {
              setMode(value as MailAiDraftMode);
              setResult(null);
            }}
            value={mode}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="draft">{t('ai_mode_draft')}</TabsTrigger>
              <TabsTrigger value="follow_up">
                {t('ai_mode_follow_up')}
              </TabsTrigger>
              <TabsTrigger value="rewrite">{t('ai_mode_rewrite')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Textarea
            className="min-h-28 resize-y outline-none focus-visible:outline-none focus-visible:ring-0"
            onChange={(event) => setInstructions(event.target.value)}
            placeholder={t('ai_compose_instructions_placeholder')}
            value={instructions}
          />
          {generation.isError ? (
            <p className="text-destructive text-sm">
              {generation.error instanceof Error
                ? generation.error.message
                : t('ai_generation_failed')}
            </p>
          ) : null}
          {result ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-dynamic bg-foreground/[0.025] p-4">
              <div className="font-semibold text-sm">
                {result.subject || t('no_subject')}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                {result.content}
              </p>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t('ai_draft_review_notice')}
          </p>
        </div>
        <DialogFooter className="border-dynamic border-t px-5 py-3">
          <Button
            disabled={!instructions.trim() || generation.isPending}
            onClick={() => generation.mutate()}
            type="button"
            variant={result ? 'outline' : 'default'}
          >
            {generation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {result ? t('regenerate') : t('generate_draft')}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              if (!result) return;
              onApply(result);
              setOpen(false);
            }}
            type="button"
          >
            {t('use_draft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
