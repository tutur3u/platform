import type { AiStudioPublicModel } from '@tuturuuu/internal-api/ai-studio';

const PREFERRED_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-lite',
  'gemini-2.5-flash-lite',
];

export function textPlaygroundModels(models: AiStudioPublicModel[]) {
  return models.filter((model) => model.type.toLowerCase() === 'language');
}

export function defaultPlaygroundModel(models: AiStudioPublicModel[]) {
  const textModels = textPlaygroundModels(models);
  for (const preferred of PREFERRED_TEXT_MODELS) {
    const match = textModels.find((model) =>
      model.id.toLowerCase().includes(preferred)
    );
    if (match) return match.id;
  }
  return textModels[0]?.id ?? '';
}

export function categorizePlaygroundModels(models: AiStudioPublicModel[]) {
  const categories = new Map<string, AiStudioPublicModel[]>();
  for (const model of textPlaygroundModels(models)) {
    const category = model.ownedBy || 'Other';
    categories.set(category, [...(categories.get(category) ?? []), model]);
  }
  return [...categories.entries()]
    .map(([provider, items]) => ({
      models: items.sort((left, right) => left.name.localeCompare(right.name)),
      provider,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}
