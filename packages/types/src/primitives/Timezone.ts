export interface Timezone {
  id?: string;
  value: string;
  abbr: string;
  offset: number;
  isdst: boolean;
  text: string;
  utc: string[];
  status?: TimezoneStatus;
  created_at?: string | null;
}

export type TimezoneStatus = 'synced' | 'outdated' | 'pending' | 'error';
