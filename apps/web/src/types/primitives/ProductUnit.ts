export interface ProductUnit {
  id: string;
  name?: string;
  type?: 'quantity' | 'non-quantity'
  ws_id?: string;
  created_at?: string;
}
