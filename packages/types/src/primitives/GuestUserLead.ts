export interface GuestUserLead {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  attendance_count: number;
  group_id: string | null;
  group_name: string | null;
  has_lead_generation: boolean;
  created_at: string;
}

export interface GuestUserLeadSettings {
  guest_user_checkup_threshold: number | null;
}
