export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'microsoft';
  account_email: string | null;
  account_name: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface GoogleCalendar {
  id: string;
  name: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
  foregroundColor: string;
  accessRole: string;
  accountId: string;
  accountEmail: string | null;
}

export interface ProviderCalendar extends GoogleCalendar {
  provider: 'google' | 'microsoft';
}

export interface AuthResponse {
  authUrl: string;
}

export interface CalendarAuthToken {
  id: string;
  access_token: string;
  refresh_token: string | null;
  account_email: string | null;
  account_name: string | null;
}

export interface CalendarSyncHealth {
  state: 'disconnected' | 'syncing' | 'healthy' | 'degraded';
  reason: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  currentlyRunning: boolean;
  retryAfterSeconds: number | null;
}
