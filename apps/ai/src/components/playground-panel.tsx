'use client';

import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  type AiStudioKeysResponse,
  type AiStudioPlaygroundEndpoint,
  type AiStudioPlaygroundTool,
  createAiStudioKey,
  getAiStudioKeys,
  getAiStudioPublicModels,
  runAiStudioPlayground,
} from '@tuturuuu/internal-api/ai-studio';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { takePlaygroundSecret } from '@/lib/playground-secret-transfer';
import { PlaygroundCredential } from './playground-credential';
import {
  PLAYGROUND_TOOLS,
  PlaygroundRequestForm,
} from './playground-request-form';
import { PlaygroundWorkbench } from './playground-workbench';

export function PlaygroundPanel({
  canManageAiKeys,
  workspaceId,
}: {
  canManageAiKeys: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.playground_console');
  const [secret, setSecret] = useState(() => takePlaygroundSecret(workspaceId));
  const [endpoint, setEndpoint] =
    useState<AiStudioPlaygroundEndpoint>('responses');
  const [model, setModel] = useState('');
  const [instructions, setInstructions] = useState(t('default_instructions'));
  const [prompt, setPrompt] = useState(t('default_prompt'));
  const [maxOutputTokens, setMaxOutputTokens] = useState(1024);
  const [maxSteps, setMaxSteps] = useState(4);
  const [enabledTools, setEnabledTools] =
    useState<AiStudioPlaygroundTool[]>(PLAYGROUND_TOOLS);

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

  const models = modelsMutation.data ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.68fr)_minmax(0,1.32fr)]">
      <div className="space-y-4">
        <PlaygroundCredential
          approvalGranted={keysQuery.data?.pages[0]?.approval.approved ?? false}
          canManageAiKeys={canManageAiKeys}
          isApprovalLoading={keysQuery.isPending}
          models={models}
          onCreateKey={() => createMutation.mutate()}
          onSecretChange={(value) => {
            setSecret(value);
            modelsMutation.reset();
          }}
          onVerify={() => {
            if (secret) modelsMutation.mutate(secret);
          }}
          secret={secret}
          verifyState={modelsMutation}
          workspaceId={workspaceId}
        />
        <PlaygroundRequestForm
          enabledTools={enabledTools}
          endpoint={endpoint}
          maxOutputTokens={maxOutputTokens}
          maxSteps={maxSteps}
          model={model}
          models={models}
          onEndpointChange={setEndpoint}
          onMaxOutputTokensChange={setMaxOutputTokens}
          onMaxStepsChange={setMaxSteps}
          onModelChange={setModel}
          onToggleTool={(tool) =>
            setEnabledTools((current) =>
              current.includes(tool)
                ? current.filter((item) => item !== tool)
                : [...current, tool]
            )
          }
        />
      </div>

      <PlaygroundWorkbench
        canRun={Boolean(secret && model && prompt.trim())}
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
