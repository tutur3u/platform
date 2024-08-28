export interface Vital {
  id: string;
  name?: string;
  unit?: string;
  value?: number | string | null;
  ws_id?: string;
  group_id?: string;
  created_at?: string;
}
