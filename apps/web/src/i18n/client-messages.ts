// The root provider is shared by public, auth, game, and UI routes. Only send
// namespaces used by client components on those surfaces. Dashboard routes
// install a nested provider with the complete catalog.
export const ROOT_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'marketing-nav',
] as const;

export const ROOT_CLIENT_MESSAGE_PATHS = [
  'common.about',
  'common.acceptable-use',
  'common.blog',
  'common.branding',
  'common.careers',
  'common.changelog',
  'common.community-guidelines',
  'common.company',
  'common.contact',
  'common.copyright',
  'common.developers',
  'common.documentation',
  'common.facebook_mockup',
  'common.footer_tagline',
  'common.get-started',
  'common.legal',
  'common.main_navigation',
  'common.meet-together',
  'common.open-source',
  'common.partners',
  'common.pricing',
  'common.privacy',
  'common.products',
  'common.qr_generator',
  'common.resources',
  'common.security',
  'common.terms',
  'common.ui',
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
  paths: readonly string[]
): Partial<T> {
  const selected: Record<string, unknown> = {};

  for (const path of paths) {
    const segments = path.split('.');
    let source: unknown = messages;

    for (const segment of segments) {
      if (!source || typeof source !== 'object' || !(segment in source)) {
        source = undefined;
        break;
      }
      source = (source as Record<string, unknown>)[segment];
    }

    if (source === undefined) continue;

    let target = selected;
    for (const segment of segments.slice(0, -1)) {
      const child = target[segment];
      if (!child || typeof child !== 'object') target[segment] = {};
      target = target[segment] as Record<string, unknown>;
    }
    target[segments.at(-1)!] = source;
  }

  return selected as Partial<T>;
}

export function getPublicClientMessages<T extends Record<string, unknown>>(
  messages: T
): Partial<T> {
  return getClientMessages(messages, ROOT_CLIENT_MESSAGE_PATHS);
}
