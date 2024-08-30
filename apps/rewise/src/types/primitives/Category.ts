export interface Category {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  created_at?: Date;
  type: string;
}
