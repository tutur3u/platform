export type UiActionSource = 'button' | 'list-item';

export interface UiActionPayload {
  id: string;
  label?: string;
  source: UiActionSource;
}

type ActionHandler = ((params?: unknown) => unknown) | undefined;

type JsonRenderActionsLike = {
  handlers?: Record<string, ActionHandler>;
} & Record<string, unknown>;

function resolveHandlerMap(actions: unknown): Record<string, ActionHandler> {
  if (!actions || typeof actions !== 'object') return {};

  const nestedHandlers = (actions as JsonRenderActionsLike).handlers;
  if (nestedHandlers && typeof nestedHandlers === 'object') {
    return nestedHandlers;
  }

  return actions as Record<string, ActionHandler>;
}

/**
 * Dispatches render_ui actions from clickable UI components.
 *
 * 1) Tries direct action handler by id
 * 2) Falls back to generic __ui_action__ to send a follow-up submission
 */
export function dispatchUiAction(
  actions: unknown,
  actionId: string | undefined,
  payload: UiActionPayload
): void {
  if (!actionId) return;

  const handlers = resolveHandlerMap(actions);
  const directHandler = handlers[actionId];
  if (typeof directHandler === 'function') {
    void Promise.resolve(directHandler());
    return;
  }

  const genericHandler = handlers.__ui_action__;
  if (typeof genericHandler === 'function') {
    void Promise.resolve(genericHandler(payload));
  }
}
