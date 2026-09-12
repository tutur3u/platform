-- Validate separately so the scan does not retain the constraint replacement lock.
alter table private.external_user_monthly_reports
  validate constraint external_user_monthly_reports_delivery_status_check;
