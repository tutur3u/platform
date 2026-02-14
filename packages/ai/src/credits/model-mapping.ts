/**
 * Maps bare model names used in existing code to gateway model IDs.
 * The gateway uses `provider/model-name` format (e.g., `google/gemini-2.5-flash`),
 * while existing code uses bare names (e.g., `gemini-2.5-flash`).
 */

/** Convert a bare model name + provider to a gateway model ID */
export function toGatewayModelId(provider: string, modelName: string): string {
  return `${provider}/${modelName}`;
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
  if (modelName.includes('/')) return modelName;
  return `${provider || 'google'}/${modelName}`;
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
