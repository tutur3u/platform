export interface Prescription {
  id: string;
  price?: number;
  price_diff?: number;
  patient_id?: string;
  creator_id?: string;
  advice?: string;
  note?: string;
  ws_id?: string;
  completed_at?: string;
  created_at?: string;
}
