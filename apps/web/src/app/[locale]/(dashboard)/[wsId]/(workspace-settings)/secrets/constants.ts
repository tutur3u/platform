import { WORKSPACE_STORAGE_SECRET_DEFINITIONS } from '@/lib/workspace-storage-config';

export interface SecretDefinition {
  name: string;
  description: string;
  type: 'boolean' | 'number' | 'bytes' | 'string' | 'duration_ms';
  defaultValue?: string;
  minValue?: number;
  maxValue?: number;
  options?: readonly string[];
  placeholder?: string;
  sensitive?: boolean;
  rolloutRequired?: boolean;
}

export const KNOWN_SECRETS: SecretDefinition[] = [
  // Storage & Limits
  {
    name: 'STORAGE_LIMIT_BYTES',
    description: 'The maximum total storage size allowed for the workspace.',
    type: 'bytes',
    defaultValue: '1073741824', // 1 GB
  },
  ...WORKSPACE_STORAGE_SECRET_DEFINITIONS,
  {
    name: 'RATE_LIMIT_WINDOW_MS',
    description: 'The time window in milliseconds for rate limiting.',
    type: 'duration_ms',
    defaultValue: '60000',
  },
  {
    name: 'RATE_LIMIT_MAX_REQUESTS',
    description: 'Maximum number of requests allowed per window.',
    type: 'number',
    defaultValue: '1000',
  },
  {
    name: 'RATE_LIMIT_UPLOAD_MAX_REQUESTS',
    description: 'Maximum number of upload requests allowed per window.',
    type: 'number',
    defaultValue: '1000',
  },
  {
    name: 'RATE_LIMIT_UPLOAD_URL_MAX_REQUESTS',
    description:
      'Maximum number of upload URL generation requests allowed per window.',
    type: 'number',
    defaultValue: '1000',
  },
  {
    name: 'RATE_LIMIT_DOWNLOAD_MAX_REQUESTS',
    description: 'Maximum number of download requests allowed per window.',
    type: 'number',
    defaultValue: '1000',
  },
  {
    name: 'EMAIL_RATE_LIMIT_MINUTE',
    description: 'Maximum number of emails a workspace can send per minute.',
    type: 'number',
    defaultValue: '50',
  },
  {
    name: 'EMAIL_RATE_LIMIT_HOUR',
    description: 'Maximum number of emails a workspace can send per hour.',
    type: 'number',
    defaultValue: '500',
  },
  {
    name: 'EMAIL_RATE_LIMIT_DAY',
    description: 'Maximum number of emails a workspace can send per day.',
    type: 'number',
    defaultValue: '5000',
  },
  {
    name: 'EMAIL_RATE_LIMIT_USER_MINUTE',
    description:
      'Maximum number of emails an authenticated sender can send per minute.',
    type: 'number',
    defaultValue: '10',
  },
  {
    name: 'EMAIL_RATE_LIMIT_USER_HOUR',
    description:
      'Maximum number of emails an authenticated sender can send per hour.',
    type: 'number',
    defaultValue: '100',
  },
  {
    name: 'EMAIL_RATE_LIMIT_RECIPIENT_HOUR',
    description:
      'Maximum number of emails a single recipient can receive per hour.',
    type: 'number',
    defaultValue: '5',
  },
  {
    name: 'EMAIL_RATE_LIMIT_RECIPIENT_DAY',
    description:
      'Maximum number of emails a single recipient can receive per day.',
    type: 'number',
    defaultValue: '20',
  },
  {
    name: 'EMAIL_RATE_LIMIT_IP_MINUTE',
    description:
      'Maximum number of email requests allowed from one IP per minute.',
    type: 'number',
    defaultValue: '20',
  },
  {
    name: 'EMAIL_RATE_LIMIT_IP_HOUR',
    description:
      'Maximum number of email requests allowed from one IP per hour.',
    type: 'number',
    defaultValue: '200',
  },
  {
    name: 'INVITE_RATE_LIMIT_MINUTE',
    description:
      'Maximum number of invite emails a workspace can send per minute.',
    type: 'number',
    defaultValue: '10',
  },
  {
    name: 'INVITE_RATE_LIMIT_HOUR',
    description:
      'Maximum number of invite emails a workspace can send per hour.',
    type: 'number',
    defaultValue: '100',
  },
  {
    name: 'INVITE_RATE_LIMIT_DAY',
    description:
      'Maximum number of invite emails a workspace can send per day.',
    type: 'number',
    defaultValue: '500',
  },

  // Feature Flags
  {
    name: 'PREVENT_WORKSPACE_DELETION',
    description: 'Prevents the workspace from being deleted.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_API_KEYS',
    description: 'Enables API key management for the workspace.',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    name: 'EXTERNAL_PROJECT_ENABLED',
    description:
      'Enables the external project studio binding for this destination workspace when managed by the root registry.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'EXTERNAL_PROJECT_CANONICAL_ID',
    description:
      'Stores the canonical external project ID assigned by the root-managed registry.',
    type: 'string',
  },
  {
    name: 'ENABLE_X',
    description: 'Enables X (formerly Twitter) integration features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_WHITEBOARDS',
    description: 'Enables whiteboard features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_USERS',
    description: 'Enables user management features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_TASKS',
    description: 'Enables task management features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_QUIZZES',
    description: 'Enables quiz features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_PROJECTS',
    description: 'Enables project management features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_LINK_SHORTENER',
    description: 'Enables the link shortener feature.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_HABITS',
    description: 'Enables habits features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_INVENTORY',
    description: 'Enables inventory management features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_FINANCE',
    description: 'Enables finance management features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_EMAIL_SENDING',
    description: 'Enables email sending capabilities.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_EDUCATION',
    description: 'Enables education-related features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_DRIVE',
    description: 'Enables file storage (Drive) features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_DOCS',
    description: 'Enables documentation features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_CHAT',
    description: 'Enables chat features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_CHALLENGES',
    description: 'Enables challenge features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_CALENDAR',
    description: 'Enables calendar features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_BLACKBOX',
    description: 'Enables blackbox features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_AI_PLAYGROUND',
    description: 'Enables the AI playground.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_AI_ONLY',
    description: 'Restricts the workspace to AI-only features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ENABLE_AI',
    description: 'Enables AI features.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    name: 'ALLOW_CRAWLERS',
    description: 'Allows web crawlers to access public workspace content.',
    type: 'boolean',
    defaultValue: 'false',
  },
];

export function isRateLimitSecretName(name?: string | null) {
  if (!name) return false;

  return (
    name.startsWith('RATE_LIMIT_') ||
    name.startsWith('EMAIL_RATE_LIMIT_') ||
    name.startsWith('INVITE_RATE_LIMIT_')
  );
}

export const RATE_LIMIT_SECRETS = KNOWN_SECRETS.filter((secret) =>
  isRateLimitSecretName(secret.name)
);

export const NON_RATE_LIMIT_SECRETS = KNOWN_SECRETS.filter(
  (secret) => !isRateLimitSecretName(secret.name)
);
