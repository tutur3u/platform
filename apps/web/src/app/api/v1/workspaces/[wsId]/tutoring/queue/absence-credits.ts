/** Legacy fallback only: reservations cannot consume absences after their date. */
export function unmatchedAbsenceDates(
  absenceDates: string[],
  reservationDates: string[]
) {
  const absences = [...absenceDates].sort();
  let consumed = 0;
  for (const reservation of [...reservationDates].sort()) {
    const next = absences[consumed];
    if (next !== undefined && next <= reservation) consumed += 1;
  }
  return absences.slice(consumed);
}
