export interface SecretDefinition {
  name: string;
  description: string;
  type: 'boolean' | 'number' | 'bytes' | 'string' | 'duration_ms';
  defaultValue?: string;
  minValue?: number;
  maxValue?: number;
}

export const KNOWN_SECRETS: SecretDefinition[] = [
  // Storage & Limits
  {
    name: 'STORAGE_LIMIT_BYTES',
    description: 'The maximum total storage size allowed for the workspace.',
    type: 'bytes',
    defaultValue: '1073741824', // 1 GB
  },
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
