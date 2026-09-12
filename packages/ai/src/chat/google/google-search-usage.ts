import { isGoogleSearchToolName } from '../../tools/google-search-events';

type SearchStep = {
  toolCalls?: ReadonlyArray<{ toolName?: string }>;
  sources?: ReadonlyArray<unknown>;
  providerMetadata?: {
    google?: { groundingMetadata?: { webSearchQueries?: unknown } };
  };
};

/** Count provider search units, without counting top-level/step metadata twice. */
export function countGoogleSearchQueries(
  model: string,
  response: SearchStep & { steps?: SearchStep[] },
  allToolCalls: ReadonlyArray<{ toolName?: string }>
): number {
  const perQuery = /(?:^|\/)gemini-3(?:[.-]|$)/.test(model);
  const legacyGemini = /(?:^|\/)gemini-[12](?:[.-]|$)/.test(model);
  const countStep = (step: SearchStep): number | null => {
    const raw =
      step.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
    const queries = Array.isArray(raw)
      ? new Set(
          raw
            .filter(
              (query): query is string =>
                typeof query === 'string' && query.trim().length > 0
            )
            .map((query) => query.trim())
        ).size
      : null;
    if (perQuery && queries !== null) return queries;
    const calls =
      step.toolCalls?.filter((call) => isGoogleSearchToolName(call.toolName))
        .length ?? 0;
    const units = queries || calls || (step.sources?.length ? 1 : 0);
    if (!units) return null;
    return legacyGemini ? 1 : calls || units;
  };
  // Each SDK step is a separate provider prompt; Gemini 2.x uses one unit per
  // grounded prompt, while Gemini 3 uses its distinct nonempty search queries.
  let observedStep = false;
  const steps =
    response.steps?.reduce((total, step, index) => {
      const finalMetadata =
        response.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
      const stepMetadata =
        step.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
      const effectiveStep =
        index === response.steps!.length - 1 &&
        !Array.isArray(stepMetadata) &&
        Array.isArray(finalMetadata)
          ? { ...step, providerMetadata: response.providerMetadata }
          : step;
      const units = countStep(effectiveStep);
      observedStep ||= units !== null;
      return total + (units ?? 0);
    }, 0) ?? 0;
  return observedStep
    ? steps
    : (countStep({ ...response, toolCalls: allToolCalls }) ?? 0);
}
