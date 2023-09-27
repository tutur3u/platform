export interface ProductPromotion {
  id: string;
  name: string;
  description?: string;
  code?: string;
  value: number;
  use_ratio: boolean;
  ws_id?: string;
  created_at?: string;
}
