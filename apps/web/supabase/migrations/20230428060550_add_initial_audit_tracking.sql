select audit.enable_tracking('public.credit_wallets'::regclass);
select audit.enable_tracking('public.currencies'::regclass);
select audit.enable_tracking('public.finance_invoice_products'::regclass);
select audit.enable_tracking('public.finance_invoices'::regclass);
select audit.enable_tracking('public.handles'::regclass);
select audit.enable_tracking(
        'public.healthcare_checkup_vital_groups'::regclass
    );
select audit.enable_tracking(
        'public.healthcare_checkup_vitals'::regclass
    );
select audit.enable_tracking('public.healthcare_checkups'::regclass);
select audit.enable_tracking('public.healthcare_diagnoses'::regclass);
select audit.enable_tracking('public.healthcare_vital_groups'::regclass);
select audit.enable_tracking('public.healthcare_vitals'::regclass);
select audit.enable_tracking('public.inventory_batch_products'::regclass);
select audit.enable_tracking('public.inventory_batches'::regclass);
select audit.enable_tracking('public.inventory_products'::regclass);
select audit.enable_tracking('public.inventory_suppliers'::regclass);
select audit.enable_tracking('public.inventory_units'::regclass);
select audit.enable_tracking('public.inventory_warehouses'::regclass);
select audit.enable_tracking('public.personal_notes'::regclass);
select audit.enable_tracking('public.product_categories'::regclass);
select audit.enable_tracking('public.task_assignees'::regclass);
select audit.enable_tracking('public.task_lists'::regclass);
select audit.enable_tracking('public.tasks'::regclass);
select audit.enable_tracking('public.team_members'::regclass);
select audit.enable_tracking('public.transaction_categories'::regclass);
select audit.enable_tracking('public.user_private_details'::regclass);
select audit.enable_tracking('public.users'::regclass);
select audit.enable_tracking('public.vital_group_vitals'::regclass);
select audit.enable_tracking('public.wallet_transactions'::regclass);
select audit.enable_tracking('public.wallet_types'::regclass);
select audit.enable_tracking('public.workspace_boards'::regclass);
select audit.enable_tracking('public.workspace_documents'::regclass);
select audit.enable_tracking('public.workspace_invites'::regclass);
select audit.enable_tracking('public.workspace_members'::regclass);
select audit.enable_tracking('public.workspace_presets'::regclass);
select audit.enable_tracking('public.workspace_products'::regclass);
select audit.enable_tracking('public.workspace_teams'::regclass);
select audit.enable_tracking('public.workspace_user_roles'::regclass);
select audit.enable_tracking('public.workspace_user_roles_users'::regclass);
select audit.enable_tracking('public.workspace_users'::regclass);
select audit.enable_tracking('public.workspace_wallet_transfers'::regclass);
select audit.enable_tracking('public.workspace_wallets'::regclass);
select audit.enable_tracking('public.workspaces'::regclass);