'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type AiStudioApiKey,
  type AiStudioPlaygroundEndpoint,
  AiStudioPlaygroundError,
  type AiStudioPlaygroundTool,
  createAiStudioKey,
  getAiStudioKeys,
  getAiStudioPublicModels,
  getAiStudioSavedKeyModels,
  runAiStudioPlayground,
  runAiStudioSavedKeyPlayground,
} from '@tuturuuu/internal-api/ai-studio';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  defaultPlaygroundModel,
  textPlaygroundModels,
} from '@/lib/playground-models';
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
  const [credentialValue, setCredentialValue] = useState(() =>
    secret ? 'manual' : 'saved:auto'
  );
  const [endpoint, setEndpoint] =
    useState<AiStudioPlaygroundEndpoint>('responses');
  const [model, setModel] = useState('');
  const [instructions, setInstructions] = useState(t('default_instructions'));
  const [prompt, setPrompt] = useState(t('default_prompt'));
  const [maxOutputTokens, setMaxOutputTokens] = useState(1024);
  const [maxSteps, setMaxSteps] = useState(4);
  const [enabledTools, setEnabledTools] =
    useState<AiStudioPlaygroundTool[]>(PLAYGROUND_TOOLS);

  const keysQuery = useQuery({
    enabled: canManageAiKeys,
    queryFn: () => getAiStudioKeys(workspaceId, { limit: 100 }),
    queryKey: ['ai-studio-keys', workspaceId, 'playground'],
  });
  const keys = keysQuery.data?.keys ?? [];
  const activeKeys = keys.filter(isActiveKey);
  const selectedSavedKeyId = credentialValue.startsWith('saved:')
    ? credentialValue === 'saved:auto'
      ? activeKeys[0]?.id
      : credentialValue.slice('saved:'.length)
    : undefined;
  const savedModelsQuery = useQuery({
    enabled: Boolean(selectedSavedKeyId),
    queryFn: () =>
      getAiStudioSavedKeyModels(workspaceId, selectedSavedKeyId ?? ''),
    queryKey: ['ai-studio-playground-models', workspaceId, selectedSavedKeyId],
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
      setCredentialValue('manual');
      modelsMutation.mutate(result.secret);
      toast.success(t('key_created'));
    },
  });
  const runMutation = useMutation({
    mutationFn: () => {
      const input = {
        endpoint,
        instructions: instructions.trim() || undefined,
        maxOutputTokens,
        maxSteps,
        model: selectedModel,
        prompt,
        tools: enabledTools,
      };
      return selectedSavedKeyId
        ? runAiStudioSavedKeyPlayground(workspaceId, selectedSavedKeyId, input)
        : runAiStudioPlayground(secret, input);
    },
    onError: (error) => toast.error(error.message),
  });

  const models = textPlaygroundModels(
    selectedSavedKeyId
      ? (savedModelsQuery.data ?? [])
      : (modelsMutation.data ?? [])
  );
  const selectedModel = models.some((item) => item.id === model)
    ? model
    : defaultPlaygroundModel(models);
  const credentialError =
    keysQuery.error ??
    (selectedSavedKeyId ? savedModelsQuery.error : modelsMutation.error);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.68fr)_minmax(0,1.32fr)]">
      <div className="space-y-4">
        <PlaygroundCredential
          approvalGranted={keysQuery.data?.approval.approved ?? false}
          canManageAiKeys={canManageAiKeys}
          credentialError={credentialError}
          credentialValue={credentialValue}
          isCredentialLoading={
            keysQuery.isPending || savedModelsQuery.isFetching
          }
          keys={keys}
          models={models}
          onCreateKey={() => createMutation.mutate()}
          onCredentialChange={(value) => {
            setCredentialValue(value);
            setModel('');
            modelsMutation.reset();
          }}
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
          model={selectedModel}
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
        canRun={Boolean(
          (selectedSavedKeyId || secret) && selectedModel && prompt.trim()
        )}
        error={
          runMutation.error instanceof AiStudioPlaygroundError
            ? runMutation.error
            : (runMutation.error ?? undefined)
        }
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

function isActiveKey(key: AiStudioApiKey) {
  return (
    !key.revoked_at &&
    (!key.expires_at || new Date(key.expires_at).getTime() > Date.now())
  );
}
