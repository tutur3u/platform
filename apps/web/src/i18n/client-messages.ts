// The root provider is shared by public, auth, game, and UI routes. Only send
// namespaces used by client components on those surfaces. Dashboard routes
// install a nested provider with the complete catalog.
export const ROOT_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'marketing-nav',
] as const;

// ClientProviders is mounted by the root layout, so its global rate-limit
// toast and diagnostics dialog must remain translated on public/auth routes.
// Keep this explicit to preserve the small root payload.
export const RATE_LIMIT_COMMON_MESSAGE_KEYS = [
  'close',
  'rate_limited_appeal_description',
  'rate_limited_appeal_failed',
  'rate_limited_appeal_failed_description',
  'rate_limited_appeal_message_label',
  'rate_limited_appeal_message_placeholder',
  'rate_limited_appeal_review_state',
  'rate_limited_appeal_submit',
  'rate_limited_appeal_submitting',
  'rate_limited_appeal_success',
  'rate_limited_appeal_title',
  'rate_limited_appeal_turnstile_failed',
  'rate_limited_appeal_turnstile_not_configured',
  'rate_limited_clear_ip_block',
  'rate_limited_clear_ip_block_failed',
  'rate_limited_clear_ip_block_failed_description',
  'rate_limited_clear_ip_block_loading',
  'rate_limited_clear_ip_block_success',
  'rate_limited_copied',
  'rate_limited_copy_details',
  'rate_limited_copy_failed',
  'rate_limited_debug_warning_description',
  'rate_limited_debug_warning_title',
  'rate_limited_details_description',
  'rate_limited_details_fields',
  'rate_limited_details_sections',
  'rate_limited_details_title',
  'rate_limited_hard_block_copy_hint',
  'rate_limited_hard_block_description',
  'rate_limited_hard_block_notice_description',
  'rate_limited_hard_block_notice_title',
  'rate_limited_hard_block_title',
  'rate_limited_retry',
  'rate_limited_staff_debug_warning',
  'rate_limited_view_details',
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
  ...RATE_LIMIT_COMMON_MESSAGE_KEYS.map((key) => `common.${key}`),
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
