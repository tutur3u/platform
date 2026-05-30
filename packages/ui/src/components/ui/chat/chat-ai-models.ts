export type ChatAiModelOption = {
  value: string;
};

export function resolveFallbackChatAiModelId({
  currentModelId,
  models,
}: {
  currentModelId?: string | null;
  models: ChatAiModelOption[];
}) {
  const firstAvailableModel = models[0]?.value;
  if (!firstAvailableModel) return null;

  if (
    currentModelId &&
    models.some((model) => model.value === currentModelId)
  ) {
    return null;
  }

  return firstAvailableModel;
}
