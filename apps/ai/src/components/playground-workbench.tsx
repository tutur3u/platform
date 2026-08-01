'use client';

import {
  AlertCircle,
  Loader2,
  Rocket,
  Sparkles,
  Terminal,
} from '@tuturuuu/icons';
import {
  AiStudioPlaygroundError,
  type AiStudioPlaygroundResult,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PlaygroundStepInspector } from './playground-step-inspector';
import { SectionCard } from './studio/section-card';

export function PlaygroundWorkbench({
  canRun,
  error,
  instructions,
  isPending,
  onInstructionsChange,
  onPromptChange,
  onRun,
  prompt,
  result,
}: {
  canRun: boolean;
  error?: Error;
  instructions: string;
  isPending: boolean;
  onInstructionsChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRun: () => void;
  prompt: string;
  result?: AiStudioPlaygroundResult;
}) {
  const t = useTranslations('ai-studio.playground_console');

  return (
    <SectionCard
      className="flex min-h-[42rem] flex-col"
      description={t('workbench_description')}
      icon={Sparkles}
      title={t('workbench_title')}
    >
      <div className="space-y-4">
        <Field label={t('instructions')}>
          <Textarea
            className="min-h-20 resize-y font-mono text-xs leading-relaxed"
            onChange={(event) => onInstructionsChange(event.target.value)}
            value={instructions}
          />
        </Field>
        <Field label={t('prompt')}>
          <Textarea
            className="min-h-36 resize-y leading-relaxed"
            onChange={(event) => onPromptChange(event.target.value)}
            value={prompt}
          />
        </Field>
        <Button
          className="w-full"
          disabled={!canRun || isPending}
          onClick={onRun}
          size="lg"
          type="button"
        >
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 size-4" />
          )}
          {isPending ? t('running') : t('run')}
        </Button>

        {error ? <PlaygroundErrorDetails error={error} /> : null}

        <div aria-live="polite" className="rounded-lg border bg-muted/20">
          {result ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-3 text-muted-foreground text-xs">
                <ResultMeta label={t('model')} value={result.model} />
                <ResultMeta
                  label={t('tokens')}
                  value={result.usage.totalTokens.toLocaleString()}
                />
                <ResultMeta
                  label={t('response_id')}
                  mono
                  value={result.requestId}
                />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {result.outputText || t('empty_output')}
              </p>
              {result.steps.length ? (
                <PlaygroundStepInspector
                  key={result.requestId}
                  steps={result.steps}
                  totalTokens={result.usage.totalTokens}
                />
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center p-6 text-center text-muted-foreground text-sm">
              <div>
                <Terminal className="mx-auto mb-2 size-5" />
                {t('output_placeholder')}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function PlaygroundErrorDetails({ error }: { error: Error }) {
  const t = useTranslations('ai-studio.playground_console');
  const playgroundError =
    error instanceof AiStudioPlaygroundError ? error : undefined;

  return (
    <div
      aria-live="assertive"
      className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-dynamic-red" />
        <div className="min-w-0 space-y-2">
          <div>
            <p className="font-medium text-sm">{t('run_failed')}</p>
            <p className="mt-1 text-muted-foreground text-sm leading-5">
              {error.message}
            </p>
          </div>
          {playgroundError ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-muted-foreground text-xs">
              {playgroundError.code ? (
                <span>{t('error_code', { code: playgroundError.code })}</span>
              ) : null}
              <span>
                {t('http_status', { status: playgroundError.status })}
              </span>
              {playgroundError.requestId ? (
                <span>
                  {t('request_id', { id: playgroundError.requestId })}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t('error_next_step')}
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultMeta({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="uppercase tracking-[0.06em]">{label}</span>
      <span
        className={`truncate text-foreground ${mono ? 'font-mono' : 'font-medium'}`}
      >
        {value}
      </span>
    </span>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
