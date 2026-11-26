import type { Subprocessor } from './types';

export const SUBPROCESSORS: readonly Subprocessor[] = [
  {
    changedAt: '2026-07-27',
    dataCategories: ['account identifiers', 'customer content', 'service logs'],
    name: 'Supabase',
    privacyUrl: 'https://supabase.com/privacy',
    purpose: 'Authentication, databases, realtime services, and file storage',
    regions: ['Customer-selected or service-configured regions'],
  },
  {
    changedAt: '2026-07-27',
    dataCategories: ['request metadata', 'application content', 'diagnostics'],
    name: 'Vercel',
    privacyUrl: 'https://vercel.com/legal/privacy-policy',
    purpose: 'Application hosting, delivery, analytics, and observability',
    regions: ['Global edge network'],
  },
  {
    changedAt: '2026-09-13',
    dataCategories: [
      'IP addresses',
      'request metadata',
      'security signals',
      'application content',
      'stored files',
      'collaboration state',
      'meeting media when enabled',
    ],
    name: 'Cloudflare',
    privacyUrl: 'https://www.cloudflare.com/privacypolicy/',
    purpose:
      'Network delivery, security, application execution, durable state, storage, and realtime/media delivery where enabled',
    regions: ['Global network'],
  },
  {
    changedAt: '2026-11-26',
    dataCategories: [
      'rate-limit keys (IP, account, or email identifiers)',
      'abuse-protection signals',
      'short-lived cache metadata',
    ],
    name: 'Upstash',
    privacyUrl: 'https://upstash.com/trust/privacy.pdf',
    purpose:
      'Serverless Redis for rate limiting, abuse-protection caches, and temporary authentication state',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-07-27',
    dataCategories: ['AI prompts and outputs when selected', 'usage metadata'],
    name: 'OpenAI',
    privacyUrl: 'https://openai.com/policies/privacy-policy/',
    purpose: 'Optional AI model inference',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-11-26',
    dataCategories: ['AI prompts and outputs when selected', 'usage metadata'],
    name: 'Anthropic',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
    purpose: 'Optional AI model inference when selected',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-07-27',
    dataCategories: [
      'integration data',
      'calendar and file content',
      'AI inputs',
    ],
    name: 'Google Cloud',
    privacyUrl: 'https://policies.google.com/privacy',
    purpose: 'Cloud infrastructure, integrations, and optional AI inference',
    regions: ['Provider-operated and customer-selected regions'],
  },
  {
    changedAt: '2026-11-26',
    dataCategories: [
      'app and device identifiers (including Firebase installation identifier)',
      'usage events, crash reports, and diagnostics when analytics is allowed (up to 2 months user-level retention)',
      'push notification token and delivered notification payload when push is enabled',
    ],
    name: 'Firebase (Google)',
    privacyUrl: 'https://firebase.google.com/support/privacy',
    purpose:
      'Mobile app opt-in usage analytics and crash reporting (Firebase Analytics and Crashlytics, only after the user chooses Allow), and opt-in push notification delivery (Firebase Cloud Messaging and Firebase Installations, only after sign-in and turning push on)',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-07-27',
    dataCategories: ['integration data', 'calendar, mail, and file content'],
    name: 'Microsoft',
    privacyUrl: 'https://privacy.microsoft.com/privacystatement',
    purpose: 'Optional Microsoft account and productivity integrations',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-09-13',
    dataCategories: ['billing contact details', 'transaction metadata'],
    name: 'Polar',
    privacyUrl: 'https://polar.sh/legal/privacy',
    purpose:
      'Merchant-of-record resale, subscription billing, payments, tax and transaction compliance; role depends on the activity',
    regions: ['Provider-operated regions'],
  },
  {
    changedAt: '2026-11-26',
    dataCategories: [
      'recipient email addresses',
      'message content and headers',
      'delivery, bounce, and complaint metadata',
    ],
    name: 'AWS SES',
    privacyUrl: 'https://aws.amazon.com/privacy/',
    purpose:
      'Transactional and workspace email delivery, bounce and complaint handling, and suppression',
    regions: ['Service-configured AWS regions'],
  },
  {
    changedAt: '2026-07-27',
    dataCategories: ['email address', 'message content', 'delivery metadata'],
    name: 'Resend',
    privacyUrl: 'https://resend.com/legal/privacy-policy',
    purpose: 'Transactional email delivery',
    regions: ['Provider-operated regions'],
  },
] as const;
