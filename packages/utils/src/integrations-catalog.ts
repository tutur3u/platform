type IntegrationCategory =
  | 'calendar'
  | 'chat'
  | 'contacts'
  | 'development'
  | 'files'
  | 'mail'
  | 'productivity'
  | 'projects';

type IntegrationGroup = 'google' | 'microsoft' | 'other';

type Integration = {
  category: IntegrationCategory;
  group: IntegrationGroup;
  id: string;
} & (
  | { status: 'available' | 'early_access'; destination: 'calendar' | 'mail' }
  | { status: 'coming_soon' }
);

export const integrationsCatalog = [
  {
    id: 'gmail',
    group: 'google',
    category: 'mail',
    status: 'early_access',
    destination: 'mail',
  },
  {
    id: 'google_workspace',
    group: 'google',
    category: 'productivity',
    status: 'coming_soon',
  },
  {
    id: 'google_calendar',
    group: 'google',
    category: 'calendar',
    status: 'available',
    destination: 'calendar',
  },
  {
    id: 'google_contacts',
    group: 'google',
    category: 'contacts',
    status: 'coming_soon',
  },
  {
    id: 'google_drive',
    group: 'google',
    category: 'files',
    status: 'coming_soon',
  },
  {
    id: 'outlook_mail',
    group: 'microsoft',
    category: 'mail',
    status: 'early_access',
    destination: 'mail',
  },
  {
    id: 'outlook_calendar',
    group: 'microsoft',
    category: 'calendar',
    status: 'available',
    destination: 'calendar',
  },
  {
    id: 'microsoft_365',
    group: 'microsoft',
    category: 'productivity',
    status: 'coming_soon',
  },
  {
    id: 'microsoft_contacts',
    group: 'microsoft',
    category: 'contacts',
    status: 'coming_soon',
  },
  {
    id: 'onedrive',
    group: 'microsoft',
    category: 'files',
    status: 'coming_soon',
  },
  {
    id: 'notion',
    group: 'other',
    category: 'productivity',
    status: 'coming_soon',
  },
  { id: 'discord', group: 'other', category: 'chat', status: 'coming_soon' },
  { id: 'jira', group: 'other', category: 'projects', status: 'coming_soon' },
  { id: 'linear', group: 'other', category: 'projects', status: 'coming_soon' },
  { id: 'slack', group: 'other', category: 'chat', status: 'coming_soon' },
  {
    id: 'github',
    group: 'other',
    category: 'development',
    status: 'coming_soon',
  },
  { id: 'zalo', group: 'other', category: 'chat', status: 'coming_soon' },
  { id: 'whatsapp', group: 'other', category: 'chat', status: 'coming_soon' },
] as const satisfies readonly Integration[];

export type CatalogIntegration = (typeof integrationsCatalog)[number];

export function getVisibleIntegrationStatus(
  status: Integration['status'],
  isVerifiedStaff: boolean
): Integration['status'] {
  return status === 'early_access' && !isVerifiedStaff ? 'coming_soon' : status;
}
