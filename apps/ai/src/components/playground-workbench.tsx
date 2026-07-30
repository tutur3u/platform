'use client';

import { Loader2, Rocket, Sparkles, Terminal } from '@tuturuuu/icons';
import type { AiStudioPlaygroundResult } from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { PlaygroundStepInspector } from './playground-step-inspector';

export function PlaygroundWorkbench({
  canRun,
  instructions,
  isPending,
  onInstructionsChange,
  onPromptChange,
  onRun,
  prompt,
  result,
}: {
  canRun: boolean;
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
    <Card className="min-h-[42rem] overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t('workbench_title')}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('workbench_description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 lg:p-6">
        <Field label={t('instructions')}>
          <Textarea
            className="min-h-24 resize-y"
            onChange={(event) => onInstructionsChange(event.target.value)}
            value={instructions}
          />
        </Field>
        <Field label={t('prompt')}>
          <Textarea
            className="min-h-40 resize-y"
            onChange={(event) => onPromptChange(event.target.value)}
            value={prompt}
          />
        </Field>
        <Button
          className="w-full"
          disabled={!canRun || isPending}
          onClick={onRun}
          size="lg"
        >
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 size-4" />
          )}
          {isPending ? t('running') : t('run')}
        </Button>
        <div
          aria-live="polite"
          className="min-h-44 rounded-xl border bg-foreground/[0.015] p-4"
        >
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{result.model}</Badge>
                <Badge variant="outline">
                  {t('token_count', { count: result.usage.totalTokens })}
                </Badge>
                <Badge variant="outline">{result.requestId}</Badge>
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
            <div className="grid min-h-36 place-items-center text-center text-muted-foreground text-sm">
              <div>
                <Terminal className="mx-auto mb-2 size-5" />
                {t('output_placeholder')}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
