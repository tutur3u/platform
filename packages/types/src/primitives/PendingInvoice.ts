export interface PendingInvoice {
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
  group_id: string;
  group_name: string;
  months_owed: string[]; // Array of months (e.g., ["2025-04", "2025-05", "2025-03"])
  attendance_days: number; // Total attendance across all unpaid months
  total_sessions: number; // Total sessions across all unpaid months
  potential_total: number; // Total amount owed (attendance_days * price)
  href?: string;
  ws_id?: string;
}

/**
 * Parses a comma-separated months string into an array of month strings.
 * Used for backward compatibility when receiving CSV format from legacy APIs.
 * @param monthsOwed - Comma-separated string of months (e.g., "2025-04, 2025-05")
 * @returns Array of trimmed month strings, with empty entries filtered out
 */
export function parseMonthsOwed(monthsOwed: string): string[] {
  return monthsOwed
    .split(',')
    .map((month) => month.trim())
    .filter((month) => month.length > 0);
}
