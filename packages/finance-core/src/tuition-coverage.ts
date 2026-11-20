export type TuitionCoverage = {
  valid_until: string | null;
  subscription_months: string[] | null;
};

const localMonth = new Intl.DateTimeFormat('sv-SE', {
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
});

export function vietnamBillingMonth(date: Date) {
  return localMonth.format(date);
}

export function hasCompletedTuitionCoverage(
  month: string,
  invoices: readonly TuitionCoverage[]
) {
  let legacyMonth: string | undefined;
  let firstExplicitMonth: string | undefined;

  for (const invoice of invoices) {
    if (invoice.subscription_months !== null) {
      for (const date of invoice.subscription_months) {
        const coveredMonth = date.slice(0, 7);
        if (date === `${month}-01`) return true;
        if (!firstExplicitMonth || coveredMonth < firstExplicitMonth) {
          firstExplicitMonth = coveredMonth;
        }
      }
    } else if (invoice.valid_until) {
      const cutoff = vietnamBillingMonth(new Date(invoice.valid_until));
      if (!legacyMonth || cutoff > legacyMonth) legacyMonth = cutoff;
    }
  }

  if (!legacyMonth) return false;
  // The pending-tuition RPC shares the legacy cutoff and first explicit month.
  return (
    month <
    (firstExplicitMonth && firstExplicitMonth > legacyMonth
      ? firstExplicitMonth
      : legacyMonth)
  );
}
