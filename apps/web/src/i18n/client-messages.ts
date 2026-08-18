// The root provider is shared by public, auth, game, and UI routes. Only send
// namespaces used by client components on those surfaces. Dashboard routes
// install a nested provider with the complete catalog.
export const ROOT_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'marketing-nav',
] as const;

export const MARKETING_CLIENT_MESSAGE_NAMESPACES = [
  'about',
  'account_switcher',
  'branding',
  'changelog-page',
  'contact',
  'course-details-tabs',
  'facebook_mockup',
  'finance-analytics',
  'finance-budgets',
  'finance-overview',
  'habit-tracker',
  'invite',
  'landing',
  'marketing-models',
  'onboarding',
  'products',
  'security-policy',
  'settings-account',
  'transaction-category-data-table',
  'user-field-data-table',
  'vietnameseWomensDay',
  'ws-flashcards',
  'ws-memories',
  'ws-polls',
  'ws-quiz-sets',
  'ws-quizzes',
] as const;

export const AUTH_CLIENT_MESSAGE_NAMESPACES = [
  ...ROOT_CLIENT_MESSAGE_NAMESPACES,
  'account_switcher',
  'auth',
  'auth-recovery',
  'login',
] as const;

export const UI_CLIENT_MESSAGE_NAMESPACES = [
  ...ROOT_CLIENT_MESSAGE_NAMESPACES,
  'ui-showcase',
] as const;

export const PUBLIC_CLIENT_MESSAGE_NAMESPACES = [
  ...ROOT_CLIENT_MESSAGE_NAMESPACES,
  ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
] as const;

export function getClientMessages<T extends Record<string, unknown>>(
  messages: T,
  namespaces: readonly string[]
): Partial<T> {
  return Object.fromEntries(
    namespaces.flatMap((namespace) =>
      namespace in messages ? [[namespace, messages[namespace]]] : []
    )
  ) as Partial<T>;
}

export function getPublicClientMessages<T extends Record<string, unknown>>(
  messages: T
): Partial<T> {
  return getClientMessages(messages, ROOT_CLIENT_MESSAGE_NAMESPACES);
}
