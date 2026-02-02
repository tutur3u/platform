-- Drop foreign key constraint first
alter table workspace_orders
  drop constraint if exists workspace_orders_user_id_fkey;

-- Then drop the column
alter table workspace_orders
  drop column if exists user_id;