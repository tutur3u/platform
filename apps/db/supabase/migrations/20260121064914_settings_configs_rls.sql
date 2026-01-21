-- Drop existing policies for workspace_configs
drop policy if exists "Allow settings managers to manage configs" on public.workspace_configs;
drop policy if exists "Allow users with manage_user_report_templates permission" on public.workspace_configs;

-- Create new policy for workspace_configs
create policy "Allow settings managers to manage configs" on public.workspace_configs
  for all
  using (has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'))
  with check (has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'));

-- Drop existing policies for workspace_settings
drop policy if exists "Allow ALL operations for workspace members" on public.workspace_settings;

-- Create new policy for workspace_settings
create policy "Allow settings managers to manage settings" on public.workspace_settings
  for all
  using (has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'))
  with check (has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings'));
