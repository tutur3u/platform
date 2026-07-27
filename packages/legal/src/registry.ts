export const PUBLIC_SERVICE_CATEGORIES = {
  ai: 'AI products, models, agents, evaluations, and developer APIs',
  collaboration:
    'Workspace collaboration, tasks, projects, calendars, and communications',
  commerce:
    'Finance, billing, payments, inventory, storefront, POS, and promotions',
  content: 'Documents, CMS, forms, files, and short links',
  customerOperations:
    'Contacts, CRM, attendance, reports, posts, and customer operations',
  developer: 'APIs, CLI, integrations, documentation, and developer tooling',
  education: 'Teaching, learning, and education workflows',
  productivity:
    'Time tracking, meetings, mail, chat, and personal productivity',
} as const;

export type PublicServiceCategory = keyof typeof PUBLIC_SERVICE_CATEGORIES;

export const PUBLIC_APP_SERVICE_CATEGORY = {
  ai: 'ai',
  apps: 'developer',
  calendar: 'collaboration',
  chat: 'productivity',
  cms: 'content',
  contacts: 'customerOperations',
  docs: 'developer',
  drive: 'content',
  finance: 'commerce',
  forms: 'content',
  hive: 'ai',
  inventory: 'commerce',
  learn: 'education',
  mail: 'productivity',
  meet: 'productivity',
  mind: 'ai',
  nova: 'ai',
  pay: 'commerce',
  platform: 'collaboration',
  rewise: 'ai',
  shortener: 'content',
  storefront: 'commerce',
  tasks: 'collaboration',
  teach: 'education',
  tools: 'developer',
  track: 'productivity',
} as const satisfies Record<string, PublicServiceCategory>;

export const CONFIGURED_EXTERNAL_PROCESSORS = [
  'Cloudflare',
  'Google Cloud',
  'Microsoft',
  'OpenAI',
  'Polar',
  'Resend',
  'Sentry',
  'Supabase',
  'Vercel',
] as const;
