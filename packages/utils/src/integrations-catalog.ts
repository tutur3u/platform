import {
  getLaunchableApp,
  type LaunchableAppEnvironment,
  resolveLaunchableAppUrl,
} from './launchable-apps';

type IntegrationCategory =
  | 'calendar'
  | 'chat'
  | 'contacts'
  | 'development'
  | 'education'
  | 'files'
  | 'mail'
  | 'productivity'
  | 'projects';

type IntegrationGroup = 'featured' | 'google' | 'microsoft' | 'other';

/** Where a connectable integration is managed. */
export type IntegrationDestination =
  | 'account_integrations'
  | 'calendar'
  | 'mail';

type Integration = {
  category: IntegrationCategory;
  group: IntegrationGroup;
  id: string;
  /** Path of the official mark on the web origin; category icon otherwise. */
  logo?: string;
} & (
  | {
      status: 'available' | 'early_access';
      destination: IntegrationDestination;
    }
  | { status: 'coming_soon' }
);

/** Account-level settings tab that lists connected integrations. */
export const ACCOUNT_INTEGRATIONS_SETTINGS_TAB = 'account_integrations';

export const UPSKII_LOGO_PATH = '/media/integrations/upskii.png';

export const integrationsCatalog = [
  {
    id: 'upskii',
    group: 'featured',
    category: 'education',
    logo: UPSKII_LOGO_PATH,
    status: 'early_access',
    destination: 'account_integrations',
  },
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

const destinationApps = {
  account_integrations: 'platform',
  calendar: 'calendar',
  mail: 'mail',
} as const satisfies Record<IntegrationDestination, string>;

/**
 * URL of the existing panel that manages a destination: Mail settings for
 * mailboxes, Calendar's integrations tab for calendars, and the web account
 * Integrations tab for account links such as Upskii.
 */
export function resolveIntegrationDestinationUrl(
  destination: IntegrationDestination,
  {
    currentOrigin,
    environment = 'auto',
    locale,
  }: {
    currentOrigin?: string;
    environment?: LaunchableAppEnvironment;
    locale?: string | null;
  } = {}
): string | null {
  const app = getLaunchableApp(destinationApps[destination]);
  if (!app) return null;

  const localePrefix = locale === 'vi' ? '/vi' : '';
  const mail = destination === 'mail';
  return resolveLaunchableAppUrl({
    app,
    currentOrigin,
    environment,
    path: mail ? `${localePrefix}/personal/inbox` : `${localePrefix}/personal`,
    searchParams: mail
      ? { mailSettings: 'open', mailSettingsTab: 'source' }
      : {
          settingsDialog: 'open',
          settingsTab:
            destination === 'calendar'
              ? 'calendar_integrations'
              : ACCOUNT_INTEGRATIONS_SETTINGS_TAB,
        },
  });
}
