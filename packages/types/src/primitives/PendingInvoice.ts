export interface PendingInvoice {
  user_id: string;
  user_name: string;
  group_id: string;
  group_name: string;
  months_owed: string; // Comma-separated list of months (e.g., "2025-04, 2025-05, 2025-03")
  attendance_days: number; // Total attendance across all unpaid months
  total_sessions: number; // Total sessions across all unpaid months
  potential_total: number; // Total amount owed (attendance_days * price)
  href?: string;
  ws_id?: string;
}
