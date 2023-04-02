export interface Wallet {
  id: string;
  name: string;
  balance?: number;
  currency?: string;
  description?: string;
  created_at?: Date;
  project_id?: string;
}
