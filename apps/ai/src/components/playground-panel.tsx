'use client';

import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Server,
  Terminal,
  Zap,
} from '@tuturuuu/icons';
import {
  type AiStudioKeysResponse,
  type AiStudioPlaygroundEndpoint,
  type AiStudioPlaygroundTool,
  createAiStudioKey,
  getAiStudioKeys,
  getAiStudioPublicModels,
  runAiStudioPlayground,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { takePlaygroundSecret } from '@/lib/playground-secret-transfer';
import { PlaygroundWorkbench } from './playground-workbench';

const tools: AiStudioPlaygroundTool[] = ['calculator', 'current_time'];

export function PlaygroundPanel({
  canManageAiKeys,
  workspaceId,
}: {
  canManageAiKeys: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.playground_console');
  const [secret, setSecret] = useState(() => takePlaygroundSecret(workspaceId));
  const [showSecret, setShowSecret] = useState(false);
  const [endpoint, setEndpoint] =
    useState<AiStudioPlaygroundEndpoint>('responses');
  const [model, setModel] = useState('');
  const [instructions, setInstructions] = useState(t('default_instructions'));
  const [prompt, setPrompt] = useState(t('default_prompt'));
  const [maxOutputTokens, setMaxOutputTokens] = useState(1024);
  const [maxSteps, setMaxSteps] = useState(4);
  const [enabledTools, setEnabledTools] = useState<AiStudioPlaygroundTool[]>([
    'calculator',
    'current_time',
  ]);

  const keysQuery = useInfiniteQuery({
    enabled: canManageAiKeys,
    getNextPageParam: (lastPage: AiStudioKeysResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAiStudioKeys(workspaceId, { cursor: pageParam, limit: 1 }),
    queryKey: ['ai-studio-keys', workspaceId, 'playground-approval'],
  });
  const modelsMutation = useMutation({
    mutationFn: (value: string) => getAiStudioPublicModels(value),
    onError: (error) => toast.error(error.message),
    onSuccess: (models) => {
      if (!model && models[0]) setModel(models[0].id);
      toast.success(t('key_verified', { count: models.length }));
    },
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createAiStudioKey(workspaceId, {
        environment: 'development',
        name: `Playground ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      }),
    onError: (error) => toast.error(error.message),
    onSuccess: (result) => {
      setSecret(result.secret);
      modelsMutation.mutate(result.secret);
      toast.success(t('key_created'));
    },
  });
  const runMutation = useMutation({
    mutationFn: () =>
      runAiStudioPlayground(secret, {
        endpoint,
        instructions: instructions.trim() || undefined,
        maxOutputTokens,
        maxSteps,
        model,
        prompt,
        tools: enabledTools,
      }),
    onError: (error) => toast.error(error.message),
  });
  const approval = keysQuery.data?.pages[0]?.approval;
  const models = modelsMutation.data ?? [];
  const canRun = Boolean(secret && model && prompt.trim());

  const verify = () => {
    if (secret) modelsMutation.mutate(secret);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.28fr)]">
      <div className="space-y-4">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                {t('credential_title')}
              </CardTitle>
              <Badge variant="outline">
                <Server className="mr-1 size-3" />
                {t('production')}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {t('credential_description')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                aria-label={t('api_key')}
                autoComplete="off"
                onChange={(event) => {
                  setSecret(event.target.value);
                  modelsMutation.reset();
                }}
                placeholder="ttr_ai_…"
                type={showSecret ? 'text' : 'password'}
                value={secret}
              />
              <Button
                aria-label={showSecret ? t('hide_key') : t('show_key')}
                onClick={() => setShowSecret((value) => !value)}
                size="icon"
                variant="outline"
              >
                {showSecret ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
              <Button
                aria-label={t('copy_key')}
                disabled={!secret}
                onClick={async () => {
                  await navigator.clipboard.writeText(secret);
                  toast.success(t('key_copied'));
                }}
                size="icon"
                variant="outline"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!secret || modelsMutation.isPending}
                onClick={verify}
                size="sm"
                variant="outline"
              >
                <CheckCircle2 className="mr-2 size-4" />
                {t('verify_key')}
              </Button>
              {canManageAiKeys && approval?.approved ? (
                <Button
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  size="sm"
                >
                  <Zap className="mr-2 size-4" />
                  {t('quick_create')}
                </Button>
              ) : null}
              {canManageAiKeys ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/${workspaceId}/api-keys`}>
                    {t('manage_keys')}
                  </Link>
                </Button>
              ) : null}
            </div>
            {canManageAiKeys && !keysQuery.isPending && !approval?.approved ? (
              <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
                {t('approval_required')}
              </p>
            ) : null}
            <p className="font-mono text-muted-foreground text-xs">
              https://ai.tuturuuu.com/v1/
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              {t('request_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('endpoint')}>
              <Select
                onValueChange={(value) =>
                  setEndpoint(value as AiStudioPlaygroundEndpoint)
                }
                value={endpoint}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responses">POST /v1/responses</SelectItem>
                  <SelectItem value="chat">
                    POST /v1/chat/completions
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('model')}>
              {models.length ? (
                <Select onValueChange={setModel} value={model}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('select_model')} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} · {item.ownedBy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={t('model_placeholder')}
                  value={model}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('max_tokens')}>
                <Input
                  max={32768}
                  min={1}
                  onChange={(event) =>
                    setMaxOutputTokens(Number(event.target.value))
                  }
                  type="number"
                  value={maxOutputTokens}
                />
              </Field>
              <Field label={t('max_steps')}>
                <Input
                  max={8}
                  min={1}
                  onChange={(event) => setMaxSteps(Number(event.target.value))}
                  type="number"
                  value={maxSteps}
                />
              </Field>
            </div>
            <Field label={t('tools')}>
              <div className="flex flex-wrap gap-2">
                {tools.map((name) => {
                  const active = enabledTools.includes(name);
                  return (
                    <Button
                      aria-pressed={active}
                      key={name}
                      onClick={() =>
                        setEnabledTools((current) =>
                          active
                            ? current.filter((item) => item !== name)
                            : [...current, name]
                        )
                      }
                      size="sm"
                      variant={active ? 'secondary' : 'outline'}
                    >
                      {t(`tool_${name}`)}
                    </Button>
                  );
                })}
              </div>
            </Field>
          </CardContent>
        </Card>
      </div>

      <PlaygroundWorkbench
        canRun={canRun}
        instructions={instructions}
        isPending={runMutation.isPending}
        onInstructionsChange={setInstructions}
        onPromptChange={setPrompt}
        onRun={() => runMutation.mutate()}
        prompt={prompt}
        result={runMutation.data}
      />
    </div>
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
