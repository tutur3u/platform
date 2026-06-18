import 'server-only';

export type QueryError = {
  code?: string;
  message?: string;
};

export type QueryResult<T> = PromiseLike<{
  count?: number | null;
  data: T | null;
  error: QueryError | null;
}>;

export type UntypedSchemaClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => QueryResult<unknown>;
};

export type SessionRow = {
  description: string | null;
  end_timezone: string;
  ends_at: string;
  group_id: string;
  id: string;
  recurrence_instance_date: string | null;
  series_id: string | null;
  source: string | null;
  start_timezone: string;
  starts_at: string;
  status: 'cancelled' | 'scheduled';
  title: string | null;
  ws_id: string;
};

export type SeriesRow = {
  days_of_week: number[];
  description: string | null;
  end_time: string;
  end_timezone: string;
  group_id: string;
  id: string;
  interval_weeks: number;
  source: string | null;
  start_date: string;
  start_time: string;
  start_timezone: string;
  title: string | null;
  until_date: string | null;
  ws_id: string;
};

export type TagRow = {
  color: string | null;
  id: string;
  name: string;
  ws_id: string;
};

export type TagLinkRow = {
  session_id: string;
  tag_id: string;
};

export type FileRow = {
  id: string;
  name: string | null;
  session_id: string;
  storage_path: string;
};

export type GroupRow = {
  id: string;
  name: string;
};
