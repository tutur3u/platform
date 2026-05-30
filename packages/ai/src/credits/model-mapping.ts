/**
 * Maps bare model names used in existing code to gateway model IDs.
 * The gateway uses `provider/model-name` format (e.g., `google/gemini-2.5-flash`),
 * while existing code uses bare names (e.g., `gemini-2.5-flash`).
 */

export const GEMINI_31_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_31_FLASH_LITE_GATEWAY_MODEL =
  'google/gemini-3.1-flash-lite';
export const GEMINI_31_FLASH_LITE_PREVIEW_MODEL =
  'gemini-3.1-flash-lite-preview';
export const GEMINI_31_FLASH_LITE_PREVIEW_GATEWAY_MODEL =
  'google/gemini-3.1-flash-lite-preview';
export const GEMINI_3_FLASH_MODEL = 'gemini-3-flash';
export const GEMINI_3_FLASH_GATEWAY_MODEL = 'google/gemini-3-flash';

/** Normalize retired model aliases to the current stable model ids. */
export function normalizeStableModelId(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  const providerPrefix =
    slashIndex === -1 ? '' : `${modelId.slice(0, slashIndex + 1)}`;
  const bareModelId =
    slashIndex === -1 ? modelId : modelId.slice(slashIndex + 1);

  if (
    bareModelId === GEMINI_31_FLASH_LITE_PREVIEW_MODEL ||
    bareModelId === GEMINI_3_FLASH_MODEL
  ) {
    return `${providerPrefix}${GEMINI_31_FLASH_LITE_MODEL}`;
  }

  return modelId;
}

/** Convert a bare model name + provider to a gateway model ID */
export function toGatewayModelId(provider: string, modelName: string): string {
  return `${provider}/${normalizeStableModelId(modelName)}`;
}

/**
 * Resolve a model name to a gateway model ID.
 * If the name already contains '/', it's assumed to be in gateway format.
 * Otherwise, prepend the provider (defaults to 'google').
 */
export function resolveGatewayModelId(
  modelName: string,
  provider?: string
): string {
  const stableModelName = normalizeStableModelId(modelName);
  if (stableModelName.includes('/')) return stableModelName;
  return `${provider || 'google'}/${stableModelName}`;
}

/**
 * Checks whether a model is allowed by an allocation list.
 * Empty lists mean "all models".
 */
export function matchesAllowedModel(
  modelName: string,
  allowedModels: string[]
): boolean {
  if (allowedModels.length === 0) return true;

  const gatewayModelId = resolveGatewayModelId(modelName);
  const bareModelName = toBareModelName(gatewayModelId);

  return allowedModels.some((allowedModel) => {
    const normalizedAllowedModel = resolveGatewayModelId(allowedModel);
    return (
      normalizedAllowedModel === gatewayModelId ||
      toBareModelName(normalizedAllowedModel) === bareModelName
    );
  });
}

export function isGoogleModelId(modelId: string): boolean {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) return true;

  const provider = modelId.slice(0, slashIndex);
  return provider === 'google' || provider === 'google-vertex';
}

/**
 * Extract the bare model name from a gateway model ID.
 * e.g., 'google/gemini-2.5-flash' → 'gemini-2.5-flash'
 */
export function toBareModelName(gatewayModelId: string): string {
  const slashIndex = gatewayModelId.indexOf('/');
  if (slashIndex === -1) return gatewayModelId;
  return gatewayModelId.slice(slashIndex + 1);
}
