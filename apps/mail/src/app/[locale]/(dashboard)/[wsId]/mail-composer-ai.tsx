'use client';

import { useMutation } from '@tanstack/react-query';
import { Bot, Loader2, Sparkles } from '@tuturuuu/icons';
import {
  type GenerateMailAiDraftResponse,
  generateMailAiDraft,
  type MailAiDraftMode,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface GenerationRequest {
  instructions: string;
  mode: MailAiDraftMode;
}

export function MailComposerAi({
  bodyHtml,
  bodyText,
  mailboxId,
  onApply,
  onOpenChange,
  open,
  recipients,
  subject,
  threadId,
  workspaceId,
}: {
  bodyHtml: string;
  bodyText: string;
  mailboxId: string;
  onApply: (result: GenerateMailAiDraftResponse) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recipients: string[];
  subject: string;
  threadId?: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const [mode, setMode] = useState<MailAiDraftMode>(
    threadId ? 'follow_up' : 'draft'
  );
  const [instructions, setInstructions] = useState('');
  const [result, setResult] = useState<GenerateMailAiDraftResponse | null>(
    null
  );
  const generation = useMutation({
    mutationFn: (request: GenerationRequest) =>
      generateMailAiDraft(workspaceId, mailboxId, {
        bodyHtml,
        bodyText,
        instructions: request.instructions,
        mode: request.mode,
        recipients,
        subject,
        threadId,
      }),
    onSuccess: setResult,
  });
  const generate = (request: GenerationRequest) => {
    setMode(request.mode);
    setInstructions(request.instructions);
    setResult(null);
    generation.mutate(request);
  };
  const quickActions: GenerationRequest[] = [
    { instructions: t('ai_quick_polish_prompt'), mode: 'rewrite' },
    { instructions: t('ai_quick_concise_prompt'), mode: 'rewrite' },
    { instructions: t('ai_quick_warm_prompt'), mode: 'rewrite' },
    ...(threadId
      ? ([
          {
            instructions: t('ai_quick_follow_up_prompt'),
            mode: 'follow_up',
          },
        ] satisfies GenerationRequest[])
      : []),
  ];
  const quickLabels = [
    t('ai_quick_polish'),
    t('ai_quick_concise'),
    t('ai_quick_warm'),
    ...(threadId ? [t('ai_quick_follow_up')] : []),
  ];

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('write_with_ai')}
          className="gap-2"
          size="sm"
          type="button"
          variant="secondary"
        >
          <Sparkles className="size-4" />
          <span className="max-sm:sr-only">{t('write_with_ai')}</span>
          <kbd className="hidden rounded border border-dynamic px-1.5 py-0.5 font-normal text-[0.65rem] text-muted-foreground lg:inline">
            {t('ai_shortcut')}
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(31rem,calc(100vw-2rem))] overflow-hidden p-0"
        side="top"
      >
        <div className="flex items-start gap-3 border-dynamic border-b p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm">{t('ai_compose_title')}</div>
            <p className="mt-0.5 text-muted-foreground text-xs leading-5">
              {t(threadId ? 'ai_context_thread' : 'ai_context_mailbox')}
            </p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action, index) => (
              <Button
                disabled={generation.isPending}
                key={`${action.mode}-${action.instructions}`}
                onClick={() => generate(action)}
                size="sm"
                type="button"
                variant="outline"
              >
                {quickLabels[index]}
              </Button>
            ))}
          </div>
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
            className="min-h-24 resize-y outline-none focus-visible:outline-none focus-visible:ring-0"
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
          {generation.isPending ? (
            <div className="flex min-h-28 items-center justify-center rounded-xl border border-dynamic bg-foreground/[0.025] text-muted-foreground text-sm">
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('ai_drafting')}
            </div>
          ) : result ? (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-dynamic bg-foreground/[0.025] p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-semibold text-sm">
                  {result.subject || t('no_subject')}
                </div>
                <Badge className="capitalize" variant="secondary">
                  {result.tone}
                </Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                {result.content}
              </p>
              {result.suggestions.length > 0 ? (
                <div className="mt-4 border-dynamic border-t pt-3">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    {t('ai_suggestions')}
                  </div>
                  <ul className="space-y-1 text-muted-foreground text-xs leading-5">
                    {result.suggestions.slice(0, 2).map((suggestion) => (
                      <li key={suggestion}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t('ai_draft_review_notice')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-dynamic border-t px-4 py-3">
          <Button
            disabled={!instructions.trim() || generation.isPending}
            onClick={() => generate({ instructions, mode })}
            size="sm"
            type="button"
            variant={result ? 'outline' : 'default'}
          >
            {result ? t('regenerate') : t('generate_draft')}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              if (!result) return;
              onApply(result);
              onOpenChange(false);
            }}
            size="sm"
            type="button"
          >
            {t('use_draft')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
