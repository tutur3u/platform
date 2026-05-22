'use client';

import { Bot, GitMerge, Route, SearchCheck, User } from '@tuturuuu/icons';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { cn } from '@tuturuuu/utils/format';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { MindAiMessageActions } from './mind-ai-message-actions';
import { hasMindAiProposalPart } from './mind-ai-proposal-island';
import { MindAiReasoning } from './mind-ai-reasoning';
import {
  type MindAiArtifactItem,
  MindAiToolActivity,
} from './mind-ai-tool-activity';
import { MindAssistantMarkdown } from './mind-assistant-markdown';

export function MindAiMessage({
  applying,
  isAnimating = false,
  message,
  onApplyPatch,
  onOpenArtifact,
  patches = [],
}: {
  applying?: boolean;
  isAnimating?: boolean;
  message: UIMessage;
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
  patches?: MindAiPatchRecord[];
}) {
  const t = useTranslations('mind');
  const isUser = message.role === 'user';
  const Icon = isUser ? User : Bot;
  const reasoningText = message.parts
    .map((part) => (part.type === 'reasoning' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n');
  const toolParts = message.parts.filter(
    (part) =>
      part.type !== 'text' &&
      part.type !== 'reasoning' &&
      part.type !== 'step-start'
  );
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
  const hasProposal = !isUser && hasMindAiProposalPart(message);

  return (
    <article
      className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser ? <IconAvatar icon={Icon} /> : null}
      <div className={cn('group max-w-[85%] space-y-1.5')}>
        <div
          className={cn(
            'space-y-2 rounded-md border px-3 py-2 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-card/90'
          )}
        >
          {hasProposal ? (
            <p className="text-muted-foreground text-xs leading-5">
              {t('ai.artifactsInTools')}
            </p>
          ) : text ? (
            isUser ? (
              <p className="whitespace-pre-wrap leading-6">{text}</p>
            ) : (
              <MindAssistantMarkdown isAnimating={isAnimating} text={text} />
            )
          ) : null}
          {reasoningText ? (
            <MindAiReasoning isStreaming={isAnimating} text={reasoningText} />
          ) : null}
          {toolParts.length ? (
            <MindAiToolActivity
              applying={applying}
              isStreaming={isAnimating}
              onApplyPatch={onApplyPatch}
              onOpenArtifact={onOpenArtifact}
              patches={patches}
              parts={toolParts}
            />
          ) : null}
        </div>
        <div
          className={cn(
            'flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          <MindAiMessageActions markdown={text} message={message} />
        </div>
      </div>
      {isUser ? <IconAvatar icon={Icon} /> : null}
    </article>
  );
}

export function EmptyAiState({
  onPickPrompt,
}: {
  onPickPrompt: (prompt: string) => void | Promise<void>;
}) {
  const t = useTranslations('mind');
  const prompts = [
    {
      description: t('ai.promptCards.expand.description'),
      icon: Route,
      prompt: t('ai.promptExpand'),
      tone: 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue',
      title: t('ai.promptCards.expand.title'),
    },
    {
      description: t('ai.promptCards.consolidate.description'),
      icon: GitMerge,
      prompt: t('ai.promptConsolidate'),
      tone: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
      title: t('ai.promptCards.consolidate.title'),
    },
    {
      description: t('ai.promptCards.risks.description'),
      icon: SearchCheck,
      prompt: t('ai.promptRisks'),
      tone: 'border-dynamic-yellow/35 bg-dynamic-yellow/10 text-dynamic-yellow',
      title: t('ai.promptCards.risks.title'),
    },
  ];
  return (
    <div className="@container mx-auto w-full max-w-3xl rounded-lg border border-dashed p-3 text-sm">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2 px-1 pb-3 text-center">
        <p className="text-pretty text-muted-foreground text-xs leading-5">
          {t('ai.empty')}
        </p>
      </div>
      <div className="grid @3xl:grid-cols-3 gap-2">
        {prompts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="group @3xl:block flex items-start gap-3 rounded-md border border-border bg-background p-3 text-left transition hover:border-foreground/25 hover:bg-muted/60"
              key={item.title}
              onClick={() => onPickPrompt(item.prompt)}
              type="button"
            >
              <span
                className={cn(
                  '@3xl:mb-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                  item.tone
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-sm">{item.title}</span>
                <span className="@3xl:mt-1 mt-0.5 block text-muted-foreground text-xs leading-5">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconAvatar({ icon: Icon }: { icon: typeof Bot }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
      <Icon className="h-4 w-4" />
    </div>
  );
}
