export interface Checkup {
  id: string;
  ws_id?: string;
  diagnosis_id?: string | null;
  patient_id?: string;
  note?: string;
  checked?: boolean;
  next_checked?: boolean;
  checkup_at?: string;
  next_checkup_at?: string | null;
  completed_at?: string | null;
  creator_id?: string;
  created_at?: string;
}
