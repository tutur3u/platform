type ActionHandler = ((params?: unknown) => unknown) | undefined;

type JsonRenderActionsLike = {
  handlers?: Record<string, ActionHandler>;
} & Record<string, unknown>;

export function resolveActionHandlerMap(
  actions: unknown
): Record<string, ActionHandler> {
  if (!actions || typeof actions !== 'object') return {};
  const nested = (actions as JsonRenderActionsLike).handlers;
  if (nested && typeof nested === 'object') {
    return nested;
  }
  return actions as Record<string, ActionHandler>;
}

export function isStructuredSubmitAction(
  actionId: string | undefined
): boolean {
  if (!actionId) return false;
  return /^submit(?:_|$)/i.test(actionId.trim());
}
