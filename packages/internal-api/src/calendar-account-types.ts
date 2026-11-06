export interface CalendarAccount {
  id: string;
  provider: 'google' | 'microsoft' | string;
  account_email: string | null;
  account_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface CalendarAccountNeedingReconnect {
  id: string;
  provider: 'google' | 'microsoft' | string;
  account_email: string | null;
  account_name: string | null;
  deactivated_reason: string;
  deactivated_at: string;
}

export interface CalendarAccountsResponse {
  accounts: CalendarAccount[];
  grouped: {
    google: CalendarAccount[];
    microsoft: CalendarAccount[];
  };
  total: number;
  // Accounts whose credential the provider rejected; reconnect restores them.
  needsReconnect?: CalendarAccountNeedingReconnect[];
}

export interface CalendarAccountDisconnectResponse {
  message: string;
  success: true;
}
