-- Validate after the column/constraint migration commits and releases its DDL lock.
-- NOT VALID still enforces both constraints for newly written rows in the interim.
alter table private.inventory_sales_periods
 validate constraint inventory_period_merge_destination;
alter table private.inventory_sales_periods
 validate constraint inventory_period_merge_not_self;
