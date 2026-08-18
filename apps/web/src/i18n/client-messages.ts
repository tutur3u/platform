// The root provider is shared by public, auth, game, and UI routes. Only send
// namespaces used by client components on those surfaces. Dashboard routes
// install a nested provider with the complete catalog.
export const PUBLIC_CLIENT_MESSAGE_NAMESPACES = [
  'about',
  'account_switcher',
  'auth',
  'auth-recovery',
  'branding',
  'changelog-page',
  'common',
  'contact',
  'course-details-tabs',
  'facebook_mockup',
  'finance-analytics',
  'finance-budgets',
  'finance-overview',
  'habit-tracker',
  'invite',
  'landing',
  'login',
  'marketing-models',
  'marketing-nav',
  'onboarding',
  'products',
  'security-policy',
  'settings-account',
  'transaction-category-data-table',
  'ui-showcase',
  'user-field-data-table',
  'vietnameseWomensDay',
  'ws-flashcards',
  'ws-memories',
  'ws-polls',
  'ws-quiz-sets',
  'ws-quizzes',
] as const;

export function getPublicClientMessages<T extends Record<string, unknown>>(
  messages: T
): Partial<T> {
  return Object.fromEntries(
    PUBLIC_CLIENT_MESSAGE_NAMESPACES.flatMap((namespace) =>
      namespace in messages ? [[namespace, messages[namespace]]] : []
    )
  ) as Partial<T>;
}
