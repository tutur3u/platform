-- Wrap every unwrapped auth.* call (USING + WITH CHECK, including calls nested inside
-- EXISTS/correlated subqueries) in (select ...) so Postgres evaluates each once per
-- statement (an InitPlan) instead of once per row -- the Supabase-documented RLS perf
-- pattern. Predicate-equivalent (row visibility unchanged). Already-wrapped calls left as-is.

ALTER POLICY "Allow root workspace users to view abuse activity signals" ON public.abuse_activity_signals
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Allow root workspace users to view abuse_events" ON public.abuse_events
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Allow root workspace users to view abuse reputation subjects" ON public.abuse_reputation_subjects
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Allow root workspace users to view abuse challenges" ON public.abuse_step_up_challenges
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Allow delete if user is the chat creator" ON public.ai_chats
    USING (((select auth.uid()) = creator_id));

ALTER POLICY "Allow read access if user is the chat creator" ON public.ai_chats
    USING (((select auth.uid()) = creator_id));

ALTER POLICY "Enable insert for authenticated users only" ON public.ai_chats
    WITH CHECK (((select auth.uid()) = creator_id));

ALTER POLICY "Enable update for chat creator" ON public.ai_chats
    USING ((creator_id = (select auth.uid())))
    WITH CHECK ((creator_id = (select auth.uid())));

ALTER POLICY "Users can view own credit transactions" ON public.ai_credit_transactions
    USING ((user_id = (select auth.uid())));

ALTER POLICY "ai_credit_transactions_select_members" ON public.ai_credit_transactions
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = ai_credit_transactions.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "ai_model_favorites_delete_own" ON public.ai_model_favorites
    USING ((user_id = (select auth.uid())));

ALTER POLICY "ai_model_favorites_insert_own" ON public.ai_model_favorites
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = ai_model_favorites.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "ai_model_favorites_select_own" ON public.ai_model_favorites
    USING (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = ai_model_favorites.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Allow root workspace users to manage blocked_ips" ON public.blocked_ips
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Allow owners and workspace members to view shares" ON public.board_template_shares
    USING (((EXISTS ( SELECT 1 FROM board_templates bt WHERE ((bt.id = board_template_shares.template_id) AND ((bt.created_by = (select auth.uid())) OR ((bt.visibility = 'workspace'::board_template_visibility) AND is_org_member((select auth.uid()), bt.ws_id)))))) OR (user_id = (select auth.uid())) OR (lower(email) = lower(( SELECT user_private_details.email FROM user_private_details WHERE (user_private_details.user_id = (select auth.uid())))))));

ALTER POLICY "Allow owners to manage shares" ON public.board_template_shares
    USING ((EXISTS ( SELECT 1 FROM board_templates bt WHERE ((bt.id = board_template_shares.template_id) AND (bt.created_by = (select auth.uid()))))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM board_templates bt WHERE ((bt.id = board_template_shares.template_id) AND (bt.created_by = (select auth.uid()))))));

ALTER POLICY "Allow delete for workspace users and the participant" ON public.calendar_auth_tokens
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Allow insert for workspace users" ON public.calendar_auth_tokens
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Allow select for workspace users and the participant" ON public.calendar_auth_tokens
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Allow update for workspace users and the participant" ON public.calendar_auth_tokens
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Allow delete for workspace members" ON public.calendar_connections
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow insert for workspace members" ON public.calendar_connections
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow select for workspace members" ON public.calendar_connections
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow update for workspace members" ON public.calendar_connections
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow delete for workspace users and the participant" ON public.calendar_event_platform_participants
    USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_calendar_events e, workspace_members m WHERE ((e.id = calendar_event_platform_participants.event_id) AND (m.user_id = calendar_event_platform_participants.user_id) AND (m.ws_id = e.ws_id))))));

ALTER POLICY "Allow select for workspace users and the participant" ON public.calendar_event_platform_participants
    USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_calendar_events e, workspace_members m WHERE ((e.id = calendar_event_platform_participants.event_id) AND (m.user_id = calendar_event_platform_participants.user_id) AND (m.ws_id = e.ws_id))))));

ALTER POLICY "Allow update for workspace users and the participant" ON public.calendar_event_platform_participants
    USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_calendar_events e, workspace_members m WHERE ((e.id = calendar_event_platform_participants.event_id) AND (m.user_id = calendar_event_platform_participants.user_id) AND (m.ws_id = e.ws_id))))))
    WITH CHECK (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_calendar_events e, workspace_members m WHERE ((e.id = calendar_event_platform_participants.event_id) AND (m.user_id = calendar_event_platform_participants.user_id) AND (m.ws_id = e.ws_id))))));

ALTER POLICY "Users with manage_changelog permission can create changelogs" ON public.changelog_entries
    WITH CHECK (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_changelog'::text));

ALTER POLICY "Users with manage_changelog permission can delete changelogs" ON public.changelog_entries
    USING (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_changelog'::text));

ALTER POLICY "Users with manage_changelog permission can update changelogs" ON public.changelog_entries
    USING (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_changelog'::text));

ALTER POLICY "Users with manage_changelog permission can view all changelogs" ON public.changelog_entries
    USING (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_changelog'::text));

ALTER POLICY "enable_users_to_insert_own_submissions" ON public.course_module_quiz_submissions
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "enable_users_to_view_own_submissions" ON public.course_module_quiz_submissions
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Allow select for user who owns attempt answers" ON public.course_test_attempt_answers
    USING ((EXISTS ( SELECT 1 FROM course_test_attempts cta WHERE ((cta.id = course_test_attempt_answers.attempt_id) AND (cta.user_id = (select auth.uid()))))));

ALTER POLICY "Allow select for user who owns attempt" ON public.course_test_attempts
    USING (((select auth.uid()) = user_id));

ALTER POLICY "course_test_modules_select_workspace_member" ON public.course_test_modules
    USING ((EXISTS ( SELECT 1 FROM (course_tests ct JOIN workspace_user_groups wug ON ((wug.id = ct.course_id))) WHERE ((ct.id = course_test_modules.test_id) AND is_org_member((select auth.uid()), wug.ws_id)))));

ALTER POLICY "course_tests_select_workspace_member" ON public.course_tests
    USING ((EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = course_tests.course_id) AND is_org_member((select auth.uid()), wug.ws_id)))));

ALTER POLICY "Allow users who have access to workspace" ON public.discord_guild_members
    USING ((EXISTS ( SELECT 1 FROM discord_integrations di, workspace_members wm WHERE ((wm.ws_id = di.ws_id) AND (wm.user_id = (select auth.uid()))))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM discord_integrations di, workspace_members wm WHERE ((wm.ws_id = di.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow users who have sufficient platform role" ON public.discord_integrations
    USING ((EXISTS ( SELECT 1 FROM platform_user_roles pur WHERE ((pur.user_id = (select auth.uid())) AND (pur.allow_discord_integrations = true)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM platform_user_roles pur WHERE ((pur.user_id = (select auth.uid())) AND (pur.allow_discord_integrations = true)))));

ALTER POLICY "Allow users from root workspace to manage the blacklist" ON public.email_blacklist
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_user_linked_users WHERE ((workspace_user_linked_users.platform_user_id = (select auth.uid())) AND (workspace_user_linked_users.ws_id = '00000000-0000-0000-0000-000000000000'::uuid)))));

ALTER POLICY "Enable all access for organization members" ON public.finance_invoice_user_groups
    USING (is_org_member((select auth.uid()), ( SELECT fi.ws_id FROM finance_invoices fi WHERE (fi.id = finance_invoice_user_groups.invoice_id))))
    WITH CHECK (is_org_member((select auth.uid()), ( SELECT fi.ws_id FROM finance_invoices fi WHERE (fi.id = finance_invoice_user_groups.invoice_id))));

ALTER POLICY "Enable all access for organization members" ON public.finance_invoices
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Full access for organization members" ON public.guest_users_lead_generation
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Users can create habit events in their workspaces" ON public.habit_calendar_events
    WITH CHECK ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can delete habit events in their workspaces" ON public.habit_calendar_events
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can update habit events in their workspaces" ON public.habit_calendar_events
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view habit events in their workspaces" ON public.habit_calendar_events
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can create habit completions in their workspaces" ON public.habit_completions
    WITH CHECK ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can delete habit completions in their workspaces" ON public.habit_completions
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can update habit completions in their workspaces" ON public.habit_completions
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view habit completions in their workspaces" ON public.habit_completions
    USING ((habit_id IN ( SELECT workspace_habits.id FROM workspace_habits WHERE (workspace_habits.ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))))));

ALTER POLICY "Enable all access for organization members" ON public.healthcare_checkups
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Hive members can read own membership" ON public.hive_members
    USING (((user_id = (select auth.uid())) OR is_hive_platform_admin()));

ALTER POLICY "Internal users can view emails" ON public.internal_emails
    USING (((user_id = (select auth.uid())) AND is_org_member(user_id, '00000000-0000-0000-0000-000000000000'::uuid)));

ALTER POLICY "Allow members to view inventory audit logs" ON private.inventory_audit_logs
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory_audit_logs'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_audit_logs'::text)));

ALTER POLICY "Allow members to create inventory manufacturers" ON private.inventory_manufacturers
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'create_inventory'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)));

ALTER POLICY "Allow members to delete inventory manufacturers" ON private.inventory_manufacturers
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'delete_inventory'::text)));

ALTER POLICY "Allow members to update inventory manufacturers" ON private.inventory_manufacturers
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)))
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)));

ALTER POLICY "Allow members to view inventory manufacturers" ON private.inventory_manufacturers
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory_catalog'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory_dashboard'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_catalog'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory'::text)));

ALTER POLICY "Allow members to create inventory owners" ON private.inventory_owners
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'create_inventory'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)));

ALTER POLICY "Allow members to delete inventory owners" ON private.inventory_owners
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'delete_inventory'::text)));

ALTER POLICY "Allow members to update inventory owners" ON private.inventory_owners
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)))
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'update_inventory'::text)));

ALTER POLICY "Allow members to view inventory owners" ON private.inventory_owners
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory_catalog'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory_dashboard'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_catalog'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'manage_inventory_setup'::text) OR has_workspace_permission(ws_id, (select auth.uid()), 'view_inventory'::text)));

ALTER POLICY "Enable all access for organization members" ON private.inventory_suppliers
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable all access for organization members" ON private.inventory_units
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable all access for organization members" ON private.inventory_warehouses
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow authenticated users to view analytics for workspace links" ON public.link_analytics
    USING ((EXISTS ( SELECT 1 FROM (shortened_links sl JOIN workspace_members wm ON ((sl.ws_id = wm.ws_id))) WHERE ((sl.id = link_analytics.link_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can manage their own sessions" ON public.live_api_sessions
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Enable all access for timeblock creators" ON public.meet_together_user_timeblocks
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_daily_stats_insert" ON public.mira_daily_stats
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_daily_stats_select" ON public.mira_daily_stats
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_daily_stats_update" ON public.mira_daily_stats
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_focus_sessions_delete" ON public.mira_focus_sessions
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_focus_sessions_insert" ON public.mira_focus_sessions
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_focus_sessions_select" ON public.mira_focus_sessions
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_focus_sessions_update" ON public.mira_focus_sessions
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_memories_delete" ON public.mira_memories
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_memories_insert" ON public.mira_memories
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_memories_select" ON public.mira_memories
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_memories_update" ON public.mira_memories
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_pets_insert" ON public.mira_pets
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_pets_select" ON public.mira_pets
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_pets_update" ON public.mira_pets
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_soul_delete" ON public.mira_soul
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_soul_insert" ON public.mira_soul
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_soul_select" ON public.mira_soul
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_soul_update" ON public.mira_soul
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_user_accessories_insert" ON public.mira_user_accessories
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_user_accessories_select" ON public.mira_user_accessories
    USING ((user_id = (select auth.uid())));

ALTER POLICY "mira_user_accessories_update" ON public.mira_user_accessories
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_user_achievements_insert" ON public.mira_user_achievements
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "mira_user_achievements_select" ON public.mira_user_achievements
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can create notes in their workspaces" ON public.notes
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = notes.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can delete their own notes" ON public.notes
    USING ((creator_id = (select auth.uid())));

ALTER POLICY "Users can update their own notes" ON public.notes
    USING ((creator_id = (select auth.uid())));

ALTER POLICY "Users can view notes in their workspaces" ON public.notes
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = notes.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can delete workspace preferences" ON public.notification_preferences
    USING (((user_id = (select auth.uid())) AND (((scope = 'workspace'::notification_scope) AND (ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid()))))) OR (scope <> 'workspace'::notification_scope))));

ALTER POLICY "Users can insert workspace preferences" ON public.notification_preferences
    WITH CHECK (((user_id = (select auth.uid())) AND (((scope = 'workspace'::notification_scope) AND (ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid()))))) OR (scope <> 'workspace'::notification_scope))));

ALTER POLICY "Users can update workspace preferences" ON public.notification_preferences
    USING (((user_id = (select auth.uid())) AND (((scope = 'workspace'::notification_scope) AND (ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid()))))) OR (scope <> 'workspace'::notification_scope))))
    WITH CHECK (((user_id = (select auth.uid())) AND (((scope = 'workspace'::notification_scope) AND (ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid()))))) OR (scope <> 'workspace'::notification_scope))));

ALTER POLICY "Users can view workspace preferences" ON public.notification_preferences
    USING (((user_id = (select auth.uid())) AND (((scope = 'workspace'::notification_scope) AND (ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid()))))) OR (scope <> 'workspace'::notification_scope))));

ALTER POLICY "Service role can manage push devices" ON public.notification_push_devices
    USING (((select auth.role()) = 'service_role'::text))
    WITH CHECK (((select auth.role()) = 'service_role'::text));

ALTER POLICY "Users can delete their own push devices" ON public.notification_push_devices
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can insert their own push devices" ON public.notification_push_devices
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Users can update their own push devices" ON public.notification_push_devices
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Users can view their own push devices" ON public.notification_push_devices
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Allow creators to view images from their inquiry folder" ON storage.objects
    USING (((bucket_id = 'support_inquiries'::text) AND ((select auth.role()) = 'authenticated'::text) AND is_org_member((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)));

ALTER POLICY "Root workspace members can delete changelog media" ON storage.objects
    USING (((bucket_id = 'changelog'::text) AND ((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Root workspace members can update changelog media" ON storage.objects
    USING (((bucket_id = 'changelog'::text) AND ((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Root workspace members can upload changelog media" ON storage.objects
    WITH CHECK (((bucket_id = 'changelog'::text) AND ((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can insert their own onboarding progress" ON public.onboarding_progress
    WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can see their own onboarding progress" ON public.onboarding_progress
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can update their own onboarding progress" ON public.onboarding_progress
    USING (((select auth.uid()) = user_id));

ALTER POLICY "payroll_items_delete" ON public.payroll_run_items
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_items_insert" ON public.payroll_run_items
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_items_select" ON public.payroll_run_items
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_items_self_select" ON public.payroll_run_items
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users wul WHERE ((wul.virtual_user_id = payroll_run_items.user_id) AND (wul.platform_user_id = (select auth.uid())) AND (wul.ws_id = payroll_run_items.ws_id)))));

ALTER POLICY "payroll_items_update" ON public.payroll_run_items
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_runs_delete" ON public.payroll_runs
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_runs_insert" ON public.payroll_runs
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_runs_select" ON public.payroll_runs
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "payroll_runs_update" ON public.payroll_runs
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_payroll'::text));

ALTER POLICY "Users can see their own roles" ON public.platform_user_roles
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Allow all if the user is the creator and workspace member" ON public.polls
    USING (((creator_id = (select auth.uid())) AND ((ws_id IS NULL) OR is_org_member((select auth.uid()), ws_id))))
    WITH CHECK (((creator_id = (select auth.uid())) AND ((ws_id IS NULL) OR is_org_member((select auth.uid()), ws_id))));

ALTER POLICY "Enable all access for organization members" ON public.product_categories
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Users can create their own rate-limit appeals" ON public.rate_limit_appeals
    WITH CHECK ((creator_id = (select auth.uid())));

ALTER POLICY "Users can read their own rate-limit appeals" ON public.rate_limit_appeals
    USING ((creator_id = (select auth.uid())));

ALTER POLICY "Tuturuuu employees can view aggregated logs" ON public.realtime_log_aggregations
    USING (is_org_member((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid));

ALTER POLICY "Allow team members to insert" ON public.shortened_links
    WITH CHECK ((EXISTS ( SELECT 1 FROM auth.users WHERE ((users.id = (select auth.uid())) AND (users.email ~~ '%@tuturuuu.com'::text)))));

ALTER POLICY "Allow team members to select" ON public.shortened_links
    USING ((EXISTS ( SELECT 1 FROM auth.users WHERE ((users.id = (select auth.uid())) AND (users.email ~~ '%@tuturuuu.com'::text)))));

ALTER POLICY "Allow workspace members to insert" ON public.shortened_links
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow workspace members to select" ON public.shortened_links
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Users can delete task events in their workspaces" ON public.task_calendar_events
    USING ((EXISTS ( SELECT 1 FROM ((tasks t LEFT JOIN workspace_boards wb ON ((t.board_id = wb.id))) LEFT JOIN workspace_members wm ON (((wb.ws_id = wm.ws_id) OR (EXISTS ( SELECT 1 FROM ((task_lists tl JOIN workspace_boards wb2 ON ((tl.board_id = wb2.id))) JOIN workspace_members wm2 ON ((wb2.ws_id = wm2.ws_id))) WHERE ((tl.id = t.list_id) AND (wm2.user_id = (select auth.uid())))))))) WHERE ((t.id = task_calendar_events.task_id) AND ((wm.user_id = (select auth.uid())) OR (wm.user_id IS NULL))))));

ALTER POLICY "Users can insert task events in their workspaces" ON public.task_calendar_events
    WITH CHECK ((EXISTS ( SELECT 1 FROM ((tasks t LEFT JOIN workspace_boards wb ON ((t.board_id = wb.id))) LEFT JOIN workspace_members wm ON (((wb.ws_id = wm.ws_id) OR (EXISTS ( SELECT 1 FROM ((task_lists tl JOIN workspace_boards wb2 ON ((tl.board_id = wb2.id))) JOIN workspace_members wm2 ON ((wb2.ws_id = wm2.ws_id))) WHERE ((tl.id = t.list_id) AND (wm2.user_id = (select auth.uid())))))))) WHERE ((t.id = task_calendar_events.task_id) AND ((wm.user_id = (select auth.uid())) OR (wm.user_id IS NULL))))));

ALTER POLICY "Users can update task events in their workspaces" ON public.task_calendar_events
    USING ((EXISTS ( SELECT 1 FROM ((tasks t LEFT JOIN workspace_boards wb ON ((t.board_id = wb.id))) LEFT JOIN workspace_members wm ON (((wb.ws_id = wm.ws_id) OR (EXISTS ( SELECT 1 FROM ((task_lists tl JOIN workspace_boards wb2 ON ((tl.board_id = wb2.id))) JOIN workspace_members wm2 ON ((wb2.ws_id = wm2.ws_id))) WHERE ((tl.id = t.list_id) AND (wm2.user_id = (select auth.uid())))))))) WHERE ((t.id = task_calendar_events.task_id) AND ((wm.user_id = (select auth.uid())) OR (wm.user_id IS NULL))))));

ALTER POLICY "Users can view task events in their workspaces" ON public.task_calendar_events
    USING ((EXISTS ( SELECT 1 FROM ((tasks t LEFT JOIN workspace_boards wb ON ((t.board_id = wb.id))) LEFT JOIN workspace_members wm ON (((wb.ws_id = wm.ws_id) OR (EXISTS ( SELECT 1 FROM ((task_lists tl JOIN workspace_boards wb2 ON ((tl.board_id = wb2.id))) JOIN workspace_members wm2 ON ((wb2.ws_id = wm2.ws_id))) WHERE ((tl.id = t.list_id) AND (wm2.user_id = (select auth.uid())))))))) WHERE ((t.id = task_calendar_events.task_id) AND ((wm.user_id = (select auth.uid())) OR (wm.user_id IS NULL))))));

ALTER POLICY "Users can manage task cycle tasks in their workspaces" ON public.task_cycle_tasks
    USING ((EXISTS ( SELECT 1 FROM (task_cycles tc JOIN workspace_members wm ON ((wm.ws_id = tc.ws_id))) WHERE ((tc.id = task_cycle_tasks.cycle_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view task cycle tasks in their workspaces" ON public.task_cycle_tasks
    USING ((EXISTS ( SELECT 1 FROM (task_cycles tc JOIN workspace_members wm ON ((wm.ws_id = tc.ws_id))) WHERE ((tc.id = task_cycle_tasks.cycle_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "task_history_select_policy" ON public.task_history
    USING ((EXISTS ( SELECT 1 FROM ((tasks t JOIN task_lists tl ON ((t.list_id = tl.id))) JOIN workspace_boards wb ON ((tl.board_id = wb.id))) WHERE ((t.id = task_history.task_id) AND (t.deleted_at IS NULL) AND ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = wb.ws_id) AND (wm.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1 FROM (workspace_role_members wrm JOIN workspace_roles wr ON ((wrm.role_id = wr.id))) WHERE ((wr.ws_id = wb.ws_id) AND (wrm.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1 FROM workspaces w WHERE ((w.id = wb.ws_id) AND (w.creator_id = (select auth.uid()))))))))));

ALTER POLICY "task_leaderboard_members_member_write" ON public.task_leaderboard_members
    WITH CHECK (((joined_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM task_leaderboards leaderboard WHERE ((leaderboard.id = task_leaderboard_members.leaderboard_id) AND is_task_progress_workspace_member(leaderboard.ws_id))))));

ALTER POLICY "task_leaderboard_teams_member_write" ON public.task_leaderboard_teams
    WITH CHECK (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM task_leaderboards leaderboard WHERE ((leaderboard.id = task_leaderboard_teams.leaderboard_id) AND is_task_progress_workspace_member(leaderboard.ws_id))))));

ALTER POLICY "task_leaderboards_member_write" ON public.task_leaderboards
    WITH CHECK ((is_task_progress_workspace_member(ws_id) AND (created_by = (select auth.uid()))));

ALTER POLICY "Enable all access for members of the task board" ON public.task_lists
    USING (is_task_board_member((select auth.uid()), board_id))
    WITH CHECK (is_task_board_member((select auth.uid()), board_id));

ALTER POLICY "task_plan_items_insert_editors" ON public.task_plan_items
    WITH CHECK ((can_access_task_plan(plan_id, 'edit'::text) AND (created_by_user_id = (select auth.uid())) AND ((target_ws_id IS NULL) OR (is_task_plan_intended_workspace(plan_id, target_ws_id) AND is_task_plan_workspace_member(target_ws_id, (select auth.uid()))))));

ALTER POLICY "task_plan_items_update_editors" ON public.task_plan_items
    WITH CHECK ((can_access_task_plan(plan_id, 'edit'::text) AND ((target_ws_id IS NULL) OR (is_task_plan_intended_workspace(plan_id, target_ws_id) AND is_task_plan_workspace_member(target_ws_id, (select auth.uid()))))));

ALTER POLICY "task_plan_shares_delete_owner" ON public.task_plan_shares
    USING ((EXISTS ( SELECT 1 FROM task_plans tp WHERE ((tp.id = task_plan_shares.plan_id) AND (tp.owner_id = (select auth.uid()))))));

ALTER POLICY "task_plan_shares_insert_owner" ON public.task_plan_shares
    WITH CHECK (((shared_by_user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM task_plans tp WHERE ((tp.id = task_plan_shares.plan_id) AND (tp.owner_id = (select auth.uid()))))) AND ((shared_with_ws_id IS NULL) OR is_task_plan_intended_workspace(plan_id, shared_with_ws_id))));

ALTER POLICY "task_plan_shares_update_owner" ON public.task_plan_shares
    USING ((EXISTS ( SELECT 1 FROM task_plans tp WHERE ((tp.id = task_plan_shares.plan_id) AND (tp.owner_id = (select auth.uid()))))))
    WITH CHECK (((EXISTS ( SELECT 1 FROM task_plans tp WHERE ((tp.id = task_plan_shares.plan_id) AND (tp.owner_id = (select auth.uid()))))) AND ((shared_with_ws_id IS NULL) OR is_task_plan_intended_workspace(plan_id, shared_with_ws_id))));

ALTER POLICY "task_plan_workspaces_insert_editors" ON public.task_plan_workspaces
    WITH CHECK ((can_access_task_plan(plan_id, 'edit'::text) AND (added_by_user_id = (select auth.uid())) AND is_task_plan_workspace_member(ws_id, (select auth.uid()))));

ALTER POLICY "task_plans_delete_owner" ON public.task_plans
    USING ((owner_id = (select auth.uid())));

ALTER POLICY "task_plans_insert_own" ON public.task_plans
    WITH CHECK (((owner_id = (select auth.uid())) AND is_task_plan_personal_workspace(personal_ws_id, (select auth.uid()))));

ALTER POLICY "task_plans_select_accessible" ON public.task_plans
    USING (((owner_id = (select auth.uid())) OR can_access_task_plan(id, 'view'::text)));

ALTER POLICY "task_profile_progress_settings_member_select" ON public.task_profile_progress_settings
    USING (((user_id = (select auth.uid())) OR ((show_progress = true) AND (visibility = 'workspace'::text) AND is_task_progress_workspace_member(ws_id))));

ALTER POLICY "task_profile_progress_settings_owner_write" ON public.task_profile_progress_settings
    USING (((user_id = (select auth.uid())) AND is_task_progress_workspace_member(ws_id)))
    WITH CHECK (((user_id = (select auth.uid())) AND is_task_progress_workspace_member(ws_id)));

ALTER POLICY "task_progress_entries_member_write" ON public.task_progress_entries
    WITH CHECK ((is_task_progress_workspace_member(ws_id) AND (created_by = (select auth.uid()))));

ALTER POLICY "task_progress_goals_member_write" ON public.task_progress_goals
    WITH CHECK ((is_task_progress_workspace_member(ws_id) AND (owner_id = (select auth.uid()))));

ALTER POLICY "Users can manage task project initiatives in their workspaces" ON public.task_project_initiatives
    USING ((EXISTS ( SELECT 1 FROM (task_projects tp JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tp.id = task_project_initiatives.project_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view task project initiatives in their workspaces" ON public.task_project_initiatives
    USING ((EXISTS ( SELECT 1 FROM (task_projects tp JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tp.id = task_project_initiatives.project_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can manage task project tasks in their workspaces" ON public.task_project_tasks
    USING ((EXISTS ( SELECT 1 FROM (task_projects tp JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tp.id = task_project_tasks.project_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view task project tasks in their workspaces" ON public.task_project_tasks
    USING ((EXISTS ( SELECT 1 FROM (task_projects tp JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tp.id = task_project_tasks.project_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can add attachments to project updates" ON public.task_project_update_attachments
    WITH CHECK (((EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_attachments.update_id) AND (wm.user_id = (select auth.uid())) AND (tpu.deleted_at IS NULL)))) AND (uploaded_by = (select auth.uid()))));

ALTER POLICY "Users can delete their own attachments" ON public.task_project_update_attachments
    USING (((uploaded_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_attachments.update_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view attachments on project updates" ON public.task_project_update_attachments
    USING ((EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_attachments.update_id) AND (wm.user_id = (select auth.uid())) AND (tpu.deleted_at IS NULL)))));

ALTER POLICY "Users can add reactions to project updates" ON public.task_project_update_reactions
    WITH CHECK (((EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_reactions.update_id) AND (wm.user_id = (select auth.uid())) AND (tpu.deleted_at IS NULL)))) AND (user_id = (select auth.uid()))));

ALTER POLICY "Users can delete their own reactions" ON public.task_project_update_reactions
    USING (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_reactions.update_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view reactions on project updates" ON public.task_project_update_reactions
    USING ((EXISTS ( SELECT 1 FROM ((task_project_updates tpu JOIN task_projects tp ON ((tp.id = tpu.project_id))) JOIN workspace_members wm ON ((wm.ws_id = tp.ws_id))) WHERE ((tpu.id = task_project_update_reactions.update_id) AND (wm.user_id = (select auth.uid())) AND (tpu.deleted_at IS NULL)))));

ALTER POLICY "Users can create task relationships in their workspaces" ON public.task_relationships
    WITH CHECK (((EXISTS ( SELECT 1 FROM ((tasks t JOIN workspace_boards wb ON ((t.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_relationships.source_task_id) AND (wm.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1 FROM ((tasks t JOIN workspace_boards wb ON ((t.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_relationships.target_task_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can delete task relationships in their workspaces" ON public.task_relationships
    USING ((EXISTS ( SELECT 1 FROM ((tasks t JOIN workspace_boards wb ON ((t.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_relationships.source_task_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can update task relationships in their workspaces" ON public.task_relationships
    USING ((EXISTS ( SELECT 1 FROM ((tasks t JOIN workspace_boards wb ON ((t.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_relationships.source_task_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view task relationships in their workspaces" ON public.task_relationships
    USING ((EXISTS ( SELECT 1 FROM ((tasks t JOIN workspace_boards wb ON ((t.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_relationships.source_task_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow users to record their share link usage" ON public.task_share_link_uses
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Allow eligible users to view task share links" ON public.task_share_links
    USING ((is_task_workspace_member(task_id) OR (public_access = 'view'::task_share_public_access) OR (EXISTS ( SELECT 1 FROM task_shares ts WHERE ((ts.task_id = task_share_links.task_id) AND ((ts.shared_with_user_id = (select auth.uid())) OR ((ts.shared_with_email IS NOT NULL) AND (lower(ts.shared_with_email) = lower(( SELECT user_private_details.email FROM user_private_details WHERE (user_private_details.user_id = (select auth.uid()))))))))))));

ALTER POLICY "Allow workspace members to create task share links" ON public.task_share_links
    WITH CHECK ((is_task_workspace_member(task_id) AND is_task_sharing_enabled(task_id) AND (created_by_user_id = (select auth.uid()))));

ALTER POLICY "Allow recipients to view their own shares" ON public.task_shares
    USING (((shared_with_user_id = (select auth.uid())) OR (lower(shared_with_email) = lower(( SELECT user_private_details.email FROM user_private_details WHERE (user_private_details.user_id = (select auth.uid())))))));

ALTER POLICY "Allow workspace members to create task shares" ON public.task_shares
    WITH CHECK ((is_task_workspace_member(task_id) AND is_task_sharing_enabled(task_id) AND (shared_by_user_id = (select auth.uid()))));

ALTER POLICY "task_templates_delete_owner" ON public.task_templates
    USING ((created_by = (select auth.uid())));

ALTER POLICY "task_templates_insert_member" ON public.task_templates
    WITH CHECK (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = task_templates.ws_id) AND (wm.user_id = (select auth.uid())) AND (wm.type = 'MEMBER'::workspace_member_type))))));

ALTER POLICY "task_templates_select_accessible" ON public.task_templates
    USING (((created_by = (select auth.uid())) OR ((visibility = 'workspace'::task_template_visibility) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = task_templates.ws_id) AND (wm.user_id = (select auth.uid())) AND (wm.type = 'MEMBER'::workspace_member_type)))))));

ALTER POLICY "task_templates_update_owner" ON public.task_templates
    USING ((created_by = (select auth.uid())))
    WITH CHECK ((created_by = (select auth.uid())));

ALTER POLICY "delete_own_task_user_override_labels" ON public.task_user_override_labels
    USING ((user_id = (select auth.uid())));

ALTER POLICY "insert_own_task_user_override_labels" ON public.task_user_override_labels
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (workspace_task_labels wtl JOIN workspaces ws ON ((ws.id = wtl.ws_id))) WHERE ((wtl.id = task_user_override_labels.label_id) AND (ws.personal = true) AND (ws.creator_id = (select auth.uid())))))));

ALTER POLICY "select_own_task_user_override_labels" ON public.task_user_override_labels
    USING ((user_id = (select auth.uid())));

ALTER POLICY "delete_own_task_user_override_projects" ON public.task_user_override_projects
    USING ((user_id = (select auth.uid())));

ALTER POLICY "insert_own_task_user_override_projects" ON public.task_user_override_projects
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (task_projects tp JOIN workspaces ws ON ((ws.id = tp.ws_id))) WHERE ((tp.id = task_user_override_projects.project_id) AND (ws.personal = true) AND (ws.creator_id = (select auth.uid())))))));

ALTER POLICY "select_own_task_user_override_projects" ON public.task_user_override_projects
    USING ((user_id = (select auth.uid())));

ALTER POLICY "delete_own_task_user_overrides" ON public.task_user_overrides
    USING ((user_id = (select auth.uid())));

ALTER POLICY "insert_own_task_user_overrides" ON public.task_user_overrides
    WITH CHECK (((user_id = (select auth.uid())) AND is_valid_personal_task_placement(user_id, personal_board_id, personal_list_id)));

ALTER POLICY "select_own_task_user_overrides" ON public.task_user_overrides
    USING ((user_id = (select auth.uid())));

ALTER POLICY "update_own_task_user_overrides" ON public.task_user_overrides
    USING ((user_id = (select auth.uid())))
    WITH CHECK (((user_id = (select auth.uid())) AND is_valid_personal_task_placement(user_id, personal_board_id, personal_list_id)));

ALTER POLICY "delete_own_task_user_scheduling_settings" ON public.task_user_scheduling_settings
    USING ((user_id = (select auth.uid())));

ALTER POLICY "insert_own_task_user_scheduling_settings" ON public.task_user_scheduling_settings
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "select_own_task_user_scheduling_settings" ON public.task_user_scheduling_settings
    USING ((user_id = (select auth.uid())));

ALTER POLICY "update_own_task_user_scheduling_settings" ON public.task_user_scheduling_settings
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Users can add themselves as watchers" ON public.task_watchers
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (((tasks t JOIN task_lists tl ON ((t.list_id = tl.id))) JOIN workspace_boards wb ON ((tl.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_watchers.task_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can remove themselves as watchers" ON public.task_watchers
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can view task watchers for accessible tasks" ON public.task_watchers
    USING ((EXISTS ( SELECT 1 FROM (((tasks t JOIN task_lists tl ON ((t.list_id = tl.id))) JOIN workspace_boards wb ON ((tl.board_id = wb.id))) JOIN workspace_members wm ON ((wb.ws_id = wm.ws_id))) WHERE ((t.id = task_watchers.task_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can only create breaks for their own sessions" ON public.time_tracking_breaks
    WITH CHECK (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM time_tracking_sessions WHERE ((time_tracking_sessions.id = time_tracking_breaks.session_id) AND (time_tracking_sessions.user_id = (select auth.uid())))))));

ALTER POLICY "Users can only delete their own breaks" ON public.time_tracking_breaks
    USING ((created_by = (select auth.uid())));

ALTER POLICY "Users can only update their own breaks" ON public.time_tracking_breaks
    USING ((created_by = (select auth.uid())));

ALTER POLICY "Users can view breaks for sessions in their workspaces" ON public.time_tracking_breaks
    USING ((EXISTS ( SELECT 1 FROM (time_tracking_sessions s JOIN workspace_members wm ON ((wm.ws_id = s.ws_id))) WHERE ((s.id = time_tracking_breaks.session_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow users to manage their own goals" ON public.time_tracking_goals
    USING (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM workspace_members wu WHERE ((wu.ws_id = time_tracking_goals.ws_id) AND (wu.user_id = (select auth.uid())))))))
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM workspace_members wu WHERE ((wu.ws_id = time_tracking_goals.ws_id) AND (wu.user_id = (select auth.uid())))))));

ALTER POLICY "Allow users to read their own goals" ON public.time_tracking_goals
    USING ((EXISTS ( SELECT 1 FROM workspace_members wu WHERE ((wu.ws_id = time_tracking_goals.ws_id) AND (wu.user_id = (select auth.uid()))))));

ALTER POLICY "Enable all access for organization members" ON public.transaction_categories
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Learners can view own Tulearn events" ON public.tulearn_gamification_events
    USING (((select auth.uid()) = user_id));

ALTER POLICY "Learners can insert own Tulearn state" ON public.tulearn_learner_state
    WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_learner_state.ws_id) AND (wm.user_id = (select auth.uid()))))) AND ((selected_workspace_id IS NULL) OR (EXISTS ( SELECT 1 FROM workspace_members selected_wm WHERE ((selected_wm.ws_id = tulearn_learner_state.selected_workspace_id) AND (selected_wm.user_id = (select auth.uid()))))))));

ALTER POLICY "Learners can update own Tulearn state" ON public.tulearn_learner_state
    USING ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_learner_state.ws_id) AND (wm.user_id = (select auth.uid())))))))
    WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_learner_state.ws_id) AND (wm.user_id = (select auth.uid()))))) AND ((selected_workspace_id IS NULL) OR (EXISTS ( SELECT 1 FROM workspace_members selected_wm WHERE ((selected_wm.ws_id = tulearn_learner_state.selected_workspace_id) AND (selected_wm.user_id = (select auth.uid()))))))));

ALTER POLICY "Learners can view own Tulearn state" ON public.tulearn_learner_state
    USING ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_learner_state.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view own Tulearn invites" ON public.tulearn_parent_invites
    USING ((((select auth.uid()) = parent_user_id) OR ((select auth.uid()) = invited_by) OR (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_parent_invites.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Parents and linked students can view Tulearn links" ON public.tulearn_parent_student_links
    USING ((((select auth.uid()) = parent_user_id) OR ((select auth.uid()) = student_platform_user_id) OR (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = tulearn_parent_student_links.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "delete_own_user_board_list_overrides" ON public.user_board_list_overrides
    USING ((user_id = (select auth.uid())));

ALTER POLICY "insert_own_user_board_list_overrides" ON public.user_board_list_overrides
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "select_own_user_board_list_overrides" ON public.user_board_list_overrides
    USING ((user_id = (select auth.uid())));

ALTER POLICY "update_own_user_board_list_overrides" ON public.user_board_list_overrides
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Users can manage their own configs" ON public.user_configs
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Enable all access for organization members" ON public.user_group_metrics
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable update for users based on email" ON public.user_private_details
    USING ((user_id = (select auth.uid())))
    WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "Root admins can insert suspensions" ON public.user_suspensions
    WITH CHECK (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "Root admins can update suspensions" ON public.user_suspensions
    USING (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "Root admins can view suspensions" ON public.user_suspensions
    USING (has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "users_can_manage_their_own_workspace_configs" ON public.user_workspace_configs
    USING (((user_id = (select auth.uid())) AND (ws_id IN ( SELECT wm.ws_id FROM workspace_members wm WHERE (wm.user_id = (select auth.uid()))))))
    WITH CHECK (((user_id = (select auth.uid())) AND (ws_id IN ( SELECT wm.ws_id FROM workspace_members wm WHERE (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Enable update for users based on their uid" ON public.users
    USING (((select auth.uid()) = id))
    WITH CHECK (((select auth.uid()) = id));

ALTER POLICY "Admins can delete holidays" ON public.vietnamese_holidays
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Admins can insert holidays" ON public.vietnamese_holidays
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Admins can update holidays" ON public.vietnamese_holidays
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can create interest configs for their workspace wallets" ON public.wallet_interest_configs
    WITH CHECK ((EXISTS ( SELECT 1 FROM (private.workspace_wallets ww JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((ww.id = wallet_interest_configs.wallet_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can delete interest configs for their workspace wallets" ON public.wallet_interest_configs
    USING ((EXISTS ( SELECT 1 FROM (private.workspace_wallets ww JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((ww.id = wallet_interest_configs.wallet_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can update interest configs for their workspace wallets" ON public.wallet_interest_configs
    USING ((EXISTS ( SELECT 1 FROM (private.workspace_wallets ww JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((ww.id = wallet_interest_configs.wallet_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view interest configs for their workspace wallets" ON public.wallet_interest_configs
    USING ((EXISTS ( SELECT 1 FROM (private.workspace_wallets ww JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((ww.id = wallet_interest_configs.wallet_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can create interest rates for their configs" ON public.wallet_interest_rates
    WITH CHECK ((EXISTS ( SELECT 1 FROM ((wallet_interest_configs wic JOIN private.workspace_wallets ww ON ((ww.id = wic.wallet_id))) JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((wic.id = wallet_interest_rates.config_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can delete interest rates for their configs" ON public.wallet_interest_rates
    USING ((EXISTS ( SELECT 1 FROM ((wallet_interest_configs wic JOIN private.workspace_wallets ww ON ((ww.id = wic.wallet_id))) JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((wic.id = wallet_interest_rates.config_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can update interest rates for their configs" ON public.wallet_interest_rates
    USING ((EXISTS ( SELECT 1 FROM ((wallet_interest_configs wic JOIN private.workspace_wallets ww ON ((ww.id = wic.wallet_id))) JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((wic.id = wallet_interest_rates.config_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view interest rates for their configs" ON public.wallet_interest_rates
    USING ((EXISTS ( SELECT 1 FROM ((wallet_interest_configs wic JOIN private.workspace_wallets ww ON ((ww.id = wic.wallet_id))) JOIN workspace_members wm ON ((wm.ws_id = ww.ws_id))) WHERE ((wic.id = wallet_interest_rates.config_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can create transaction tags in their workspace" ON public.wallet_transaction_tags
    WITH CHECK ((EXISTS ( SELECT 1 FROM ((wallet_transactions wt JOIN private.workspace_wallets ww ON ((wt.wallet_id = ww.id))) JOIN workspace_members wm ON ((ww.ws_id = wm.ws_id))) WHERE ((wt.id = wallet_transaction_tags.transaction_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can delete transaction tags in their workspace" ON public.wallet_transaction_tags
    USING ((EXISTS ( SELECT 1 FROM ((wallet_transactions wt JOIN private.workspace_wallets ww ON ((wt.wallet_id = ww.id))) JOIN workspace_members wm ON ((ww.ws_id = wm.ws_id))) WHERE ((wt.id = wallet_transaction_tags.transaction_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Users can view transaction tags in their workspace" ON public.wallet_transaction_tags
    USING ((EXISTS ( SELECT 1 FROM ((wallet_transactions wt JOIN private.workspace_wallets ww ON ((wt.wallet_id = ww.id))) JOIN workspace_members wm ON ((ww.ws_id = wm.ws_id))) WHERE ((wt.id = wallet_transaction_tags.transaction_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "wf_benefits_delete" ON public.workforce_benefits
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_benefits_insert" ON public.workforce_benefits
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_benefits_select" ON public.workforce_benefits
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_benefits_update" ON public.workforce_benefits
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_compensation_delete" ON public.workforce_compensation
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_compensation_insert" ON public.workforce_compensation
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_compensation_select" ON public.workforce_compensation
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_compensation_update" ON public.workforce_compensation
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_contracts_delete" ON public.workforce_contracts
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_contracts_insert" ON public.workforce_contracts
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_contracts_select" ON public.workforce_contracts
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "wf_contracts_self_select" ON public.workforce_contracts
    USING ((EXISTS ( SELECT 1 FROM workspace_user_linked_users wul WHERE ((wul.virtual_user_id = workforce_contracts.user_id) AND (wul.platform_user_id = (select auth.uid())) AND (wul.ws_id = workforce_contracts.ws_id)))));

ALTER POLICY "wf_contracts_update" ON public.workforce_contracts
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workforce'::text));

ALTER POLICY "Users can view own credit balances" ON public.workspace_ai_credit_balances
    USING ((user_id = (select auth.uid())));

ALTER POLICY "ai_credit_balances_select_members" ON public.workspace_ai_credit_balances
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_ai_credit_balances.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow workspace members to delete categories" ON public.workspace_calendar_categories
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_calendar_categories.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow workspace members to insert categories" ON public.workspace_calendar_categories
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_calendar_categories.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow workspace members to read categories" ON public.workspace_calendar_categories
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_calendar_categories.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Allow workspace members to update categories" ON public.workspace_calendar_categories
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_calendar_categories.ws_id) AND (wm.user_id = (select auth.uid()))))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_calendar_categories.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Enable all access for workspace members" ON public.workspace_calendar_hour_settings
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable access for workspace members" ON public.workspace_calendar_sync_coordination
    USING ((EXISTS ( SELECT 1 FROM workspace_members WHERE ((workspace_members.ws_id = workspace_calendar_sync_coordination.ws_id) AND (workspace_members.user_id = (select auth.uid()))))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_members WHERE ((workspace_members.ws_id = workspace_calendar_sync_coordination.ws_id) AND (workspace_members.user_id = (select auth.uid()))))));

ALTER POLICY "Users can join channels in their workspace" ON public.workspace_chat_participants
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (workspace_chat_channels c JOIN workspace_members m ON ((m.ws_id = c.ws_id))) WHERE ((c.id = workspace_chat_participants.channel_id) AND (m.user_id = (select auth.uid())))))));

ALTER POLICY "Users can leave channels" ON public.workspace_chat_participants
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can update their participant status" ON public.workspace_chat_participants
    USING (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (workspace_chat_channels c JOIN workspace_members m ON ((m.ws_id = c.ws_id))) WHERE ((c.id = workspace_chat_participants.channel_id) AND (m.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view participants in their channels" ON public.workspace_chat_participants
    USING ((EXISTS ( SELECT 1 FROM (workspace_chat_channels c JOIN workspace_members m ON ((m.ws_id = c.ws_id))) WHERE ((c.id = workspace_chat_participants.channel_id) AND (m.user_id = (select auth.uid()))))));

ALTER POLICY "Users can create their typing indicator" ON public.workspace_chat_typing_indicators
    WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM (workspace_chat_channels c JOIN workspace_members m ON ((m.ws_id = c.ws_id))) WHERE ((c.id = workspace_chat_typing_indicators.channel_id) AND (m.user_id = (select auth.uid())))))));

ALTER POLICY "Users can delete their typing indicator" ON public.workspace_chat_typing_indicators
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can update their typing indicator" ON public.workspace_chat_typing_indicators
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Users can view typing indicators in their channels" ON public.workspace_chat_typing_indicators
    USING ((EXISTS ( SELECT 1 FROM (workspace_chat_channels c JOIN workspace_members m ON ((m.ws_id = c.ws_id))) WHERE ((c.id = workspace_chat_typing_indicators.channel_id) AND (m.user_id = (select auth.uid()))))));

ALTER POLICY "Allow settings managers to manage configs" ON public.workspace_configs
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text));

ALTER POLICY "Allow all access for workspace member" ON public.workspace_course_modules
    USING ((EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_course_modules.group_id) AND is_org_member((select auth.uid()), wug.ws_id)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_course_modules.group_id) AND is_org_member((select auth.uid()), wug.ws_id)))));

ALTER POLICY "allow users to select credit pack purchases" ON public.workspace_credit_pack_purchases
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "Enable all access for workspace members" ON public.workspace_cron_jobs
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow role managers to manage default permissions" ON public.workspace_default_permissions
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text) OR (EXISTS ( SELECT wss.id FROM workspaces wss WHERE ((wss.id = workspace_default_permissions.ws_id) AND (wss.creator_id = (select auth.uid())))))))
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text) OR (EXISTS ( SELECT wss.id FROM workspaces wss WHERE ((wss.id = workspace_default_permissions.ws_id) AND (wss.creator_id = (select auth.uid())))))));

ALTER POLICY "Enable read access for workspace users" ON public.workspace_default_permissions
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow member managers to send email invites" ON public.workspace_email_invites
    WITH CHECK (((is_member_invited((select auth.uid()), ws_id) OR (is_org_member((select auth.uid()), ws_id) AND has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text)) OR (EXISTS ( SELECT 1 FROM workspace_email_invites wei WHERE (lower(wei.email) = lower((select auth.email())))))) AND workspace_has_available_seats(ws_id)));

ALTER POLICY "Allow member managers to update email invites" ON public.workspace_email_invites
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id)))
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id)));

ALTER POLICY "Enable delete for organization members and current user" ON public.workspace_email_invites
    USING (((lower((select auth.email())) = lower(email)) OR is_org_member((select auth.uid()), ws_id)));

ALTER POLICY "Enable insert for workspace members" ON public.workspace_email_invites
    WITH CHECK ((is_org_member((select auth.uid()), ws_id) AND (NOT (EXISTS ( SELECT 1 FROM workspace_secrets wss WHERE ((wss.ws_id = workspace_email_invites.ws_id) AND (wss.name = 'DISABLE_INVITE'::text)))))));

ALTER POLICY "Enable read access for organization members and current user" ON public.workspace_email_invites
    USING (((lower((select auth.email())) = lower(email)) OR is_org_member((select auth.uid()), ws_id)));

ALTER POLICY "Allow all access for workspace member" ON public.workspace_flashcards
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Workspace members can create workspace guest permissions" ON public.workspace_guest_permissions
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_guests wg WHERE ((wg.id = workspace_guest_permissions.guest_id) AND ((workspace_guest_permissions.resource_id IS NULL) OR (EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_guest_permissions.resource_id) AND (wug.ws_id = wg.ws_id))))) AND has_workspace_permission(wg.ws_id, (select auth.uid()), 'manage_workspace_members'::text)))));

ALTER POLICY "Workspace members can delete workspace guest permissions" ON public.workspace_guest_permissions
    USING ((EXISTS ( SELECT 1 FROM workspace_guests wg WHERE ((wg.id = workspace_guest_permissions.guest_id) AND has_workspace_permission(wg.ws_id, (select auth.uid()), 'manage_workspace_members'::text)))));

ALTER POLICY "Workspace members can update workspace guest permissions" ON public.workspace_guest_permissions
    USING ((EXISTS ( SELECT 1 FROM workspace_guests wg WHERE ((wg.id = workspace_guest_permissions.guest_id) AND ((workspace_guest_permissions.resource_id IS NULL) OR (EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_guest_permissions.resource_id) AND (wug.ws_id = wg.ws_id))))) AND has_workspace_permission(wg.ws_id, (select auth.uid()), 'manage_workspace_members'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_guests wg WHERE ((wg.id = workspace_guest_permissions.guest_id) AND ((workspace_guest_permissions.resource_id IS NULL) OR (EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_guest_permissions.resource_id) AND (wug.ws_id = wg.ws_id))))) AND has_workspace_permission(wg.ws_id, (select auth.uid()), 'manage_workspace_members'::text)))));

ALTER POLICY "Workspace members can view workspace guest permissions" ON public.workspace_guest_permissions
    USING ((EXISTS ( SELECT 1 FROM workspace_guests wg WHERE ((wg.id = workspace_guest_permissions.guest_id) AND (is_org_member((select auth.uid()), wg.ws_id) OR (wg.user_id = (select auth.uid())))))));

ALTER POLICY "Workspace members can create workspace guests" ON public.workspace_guests
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Workspace members can delete workspace guests" ON public.workspace_guests
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Workspace members can update workspace guests" ON public.workspace_guests
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Workspace members can view workspace guests" ON public.workspace_guests
    USING ((is_org_member((select auth.uid()), ws_id) OR (user_id = (select auth.uid()))));

ALTER POLICY "Users can view habit tracker entries in their workspaces" ON public.workspace_habit_tracker_entries
    USING ((ws_id IN ( SELECT wm.ws_id FROM workspace_members wm WHERE (wm.user_id = (select auth.uid())))));

ALTER POLICY "Users can view habit tracker streak actions in their workspaces" ON public.workspace_habit_tracker_streak_actions
    USING ((ws_id IN ( SELECT wm.ws_id FROM workspace_members wm WHERE (wm.user_id = (select auth.uid())))));

ALTER POLICY "Users can view habit trackers in their workspaces" ON public.workspace_habit_trackers
    USING ((ws_id IN ( SELECT wm.ws_id FROM workspace_members wm WHERE (wm.user_id = (select auth.uid())))));

ALTER POLICY "Allow authenticated users to record invite link usage" ON public.workspace_invite_link_uses
    WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1 FROM workspace_invite_links wil WHERE ((wil.id = workspace_invite_link_uses.invite_link_id) AND (wil.ws_id = workspace_invite_link_uses.ws_id)))) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_invite_link_uses.ws_id) AND (wm.user_id = (select auth.uid())))))));

ALTER POLICY "Allow workspace members to view invite link uses" ON public.workspace_invite_link_uses
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow workspace members to create invite links" ON public.workspace_invite_links
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND (NOT (EXISTS ( SELECT 1 FROM workspace_secrets wss WHERE ((wss.ws_id = workspace_invite_links.ws_id) AND (wss.name = 'DISABLE_INVITE'::text)))))));

ALTER POLICY "Allow workspace members to delete invite links" ON public.workspace_invite_links
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Allow workspace members to update invite links" ON public.workspace_invite_links
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Allow workspace members to view invite links" ON public.workspace_invite_links
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow member managers to delete invites" ON public.workspace_invites
    USING ((((select auth.uid()) = user_id) OR (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id))));

ALTER POLICY "Allow member managers to insert invites" ON public.workspace_invites
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id) AND (NOT is_org_member(user_id, ws_id)) AND (NOT (EXISTS ( SELECT 1 FROM workspace_secrets wss WHERE ((wss.ws_id = workspace_invites.ws_id) AND (wss.name = 'DISABLE_INVITE'::text))))) AND workspace_has_available_seats(ws_id)));

ALTER POLICY "Allow member managers to update invites" ON public.workspace_invites
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id)))
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id)));

ALTER POLICY "Allow members to view invites" ON public.workspace_invites
    USING ((((select auth.uid()) = user_id) OR is_org_member((select auth.uid()), ws_id)));

ALTER POLICY "Allow workspace members to have full permissions" ON public.workspace_meetings
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow workspace managers to delete members" ON public.workspace_members
    USING ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) OR ((select auth.uid()) = user_id)));

ALTER POLICY "Allow workspace managers to insert members with constraints" ON public.workspace_members
    WITH CHECK (((user_id = (select auth.uid())) AND ((((is_personal_workspace(ws_id) = false) OR is_workspace_owner(ws_id, (select auth.uid()))) AND (is_member_invited((select auth.uid()), ws_id) OR (EXISTS ( SELECT 1 FROM workspace_email_invites wei WHERE (lower(wei.email) = lower((select auth.email()))))))) OR (EXISTS ( SELECT 1 FROM workspaces w WHERE ((w.id = workspace_members.ws_id) AND (w.creator_id = (select auth.uid())) AND (NOT (EXISTS ( SELECT 1 FROM workspace_members wm WHERE (wm.ws_id = wm.ws_id))))))))));

ALTER POLICY "Allow workspace managers to update members" ON public.workspace_members
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Enable read access for organization members" ON public.workspace_members
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "allow users to create orders" ON public.workspace_orders
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to delete orders" ON public.workspace_orders
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to update orders" ON public.workspace_orders
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to view orders" ON public.workspace_orders
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "Allow all access for workspace member" ON public.workspace_quiz_sets
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow all access for workspace member" ON public.workspace_quizzes
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow role managers to manage role members" ON public.workspace_role_members
    USING (has_workspace_permission(( SELECT wr.ws_id FROM workspace_roles wr WHERE (wr.id = workspace_role_members.role_id)), (select auth.uid()), 'manage_workspace_roles'::text))
    WITH CHECK (has_workspace_permission(( SELECT wr.ws_id FROM workspace_roles wr WHERE (wr.id = workspace_role_members.role_id)), (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "Allow role members to view" ON public.workspace_role_members
    USING ((user_id = (select auth.uid())));

ALTER POLICY "Allow role managers to manage permissions" ON public.workspace_role_permissions
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "Allow role managers to delete wallet whitelists" ON public.workspace_role_wallet_whitelist
    USING ((EXISTS ( SELECT 1 FROM workspace_roles wr WHERE ((wr.id = workspace_role_wallet_whitelist.role_id) AND has_workspace_permission(wr.ws_id, (select auth.uid()), 'manage_workspace_roles'::text)))));

ALTER POLICY "Allow role managers to insert wallet whitelists" ON public.workspace_role_wallet_whitelist
    WITH CHECK (((EXISTS ( SELECT 1 FROM workspace_roles wr WHERE ((wr.id = workspace_role_wallet_whitelist.role_id) AND has_workspace_permission(wr.ws_id, (select auth.uid()), 'manage_workspace_roles'::text)))) AND (EXISTS ( SELECT 1 FROM private.workspace_wallets ww WHERE ((ww.id = workspace_role_wallet_whitelist.wallet_id) AND (ww.ws_id = ( SELECT workspace_roles.ws_id FROM workspace_roles WHERE (workspace_roles.id = workspace_role_wallet_whitelist.role_id))))))));

ALTER POLICY "Allow role managers to update wallet whitelists" ON public.workspace_role_wallet_whitelist
    USING ((EXISTS ( SELECT 1 FROM workspace_roles wr WHERE ((wr.id = workspace_role_wallet_whitelist.role_id) AND has_workspace_permission(wr.ws_id, (select auth.uid()), 'manage_workspace_roles'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM (workspace_roles wr JOIN private.workspace_wallets w ON ((w.id = workspace_role_wallet_whitelist.wallet_id))) WHERE ((wr.id = workspace_role_wallet_whitelist.role_id) AND (w.ws_id = wr.ws_id) AND has_workspace_permission(wr.ws_id, (select auth.uid()), 'manage_workspace_roles'::text)))));

ALTER POLICY "Allow role managers to view wallet whitelists" ON public.workspace_role_wallet_whitelist
    USING ((EXISTS ( SELECT 1 FROM workspace_roles wr WHERE ((wr.id = workspace_role_wallet_whitelist.role_id) AND has_workspace_permission(wr.ws_id, (select auth.uid()), 'manage_workspace_roles'::text)))));

ALTER POLICY "Allow role managers to manage roles" ON public.workspace_roles
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

ALTER POLICY "Allow platform admins to manage workspace secrets" ON public.workspace_secrets
    USING ((has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_workspace_secrets'::text) AND is_org_member((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)))
    WITH CHECK ((has_workspace_permission('00000000-0000-0000-0000-000000000000'::uuid, (select auth.uid()), 'manage_workspace_secrets'::text) AND is_org_member((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)));

ALTER POLICY "Allow settings managers to manage settings" ON public.workspace_settings
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text));

ALTER POLICY "allow users to create subscriptions" ON public.workspace_subscriptions
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to delete subscriptions" ON public.workspace_subscriptions
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to edit subscriptions" ON public.workspace_subscriptions
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "allow users to view subscriptions" ON public.workspace_subscriptions
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

ALTER POLICY "Users can create labels in their workspaces" ON public.workspace_task_labels
    WITH CHECK ((ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))));

ALTER POLICY "Users can delete labels in their workspaces" ON public.workspace_task_labels
    USING ((ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))));

ALTER POLICY "Users can update labels in their workspaces" ON public.workspace_task_labels
    USING ((ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))));

ALTER POLICY "Users can view labels in their workspaces" ON public.workspace_task_labels
    USING ((ws_id IN ( SELECT workspace_members.ws_id FROM workspace_members WHERE (workspace_members.user_id = (select auth.uid())))));

ALTER POLICY "Allow settings managers to manage reminder settings" ON public.workspace_task_reminder_settings
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text));

ALTER POLICY "Workspace members can view reminder settings" ON public.workspace_task_reminder_settings
    USING ((EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_task_reminder_settings.ws_id) AND (wm.user_id = (select auth.uid()))))));

ALTER POLICY "Enable all access for organization members" ON public.workspace_teams
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow settings managers to manage tag groups" ON public.workspace_user_group_tag_groups
    USING ((EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_user_group_tag_groups.group_id) AND has_workspace_permission(wug.ws_id, (select auth.uid()), 'manage_workspace_settings'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM workspace_user_groups wug WHERE ((wug.id = workspace_user_group_tag_groups.group_id) AND has_workspace_permission(wug.ws_id, (select auth.uid()), 'manage_workspace_settings'::text)))));

ALTER POLICY "Allow settings managers to manage user group tags" ON public.workspace_user_group_tags
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_settings'::text));

ALTER POLICY "Allow users with manage_users to view all groups" ON public.workspace_user_groups
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_users'::text));

ALTER POLICY "Enable all access for organization members" ON public.workspace_user_groups
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable all access for organization members" ON public.workspace_user_groups_users
    USING (is_org_member((select auth.uid()), ( SELECT workspace_user_groups.ws_id FROM workspace_user_groups WHERE (workspace_user_groups.id = workspace_user_groups_users.group_id))))
    WITH CHECK (is_org_member((select auth.uid()), ( SELECT workspace_user_groups.ws_id FROM workspace_user_groups WHERE (workspace_user_groups.id = workspace_user_groups_users.group_id))));

ALTER POLICY "Allow insert for workspace users" ON public.workspace_user_linked_users
    WITH CHECK ((((platform_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.user_id = workspace_user_linked_users.platform_user_id) AND (wm.ws_id = workspace_user_linked_users.ws_id))))) AND (EXISTS ( SELECT 1 FROM workspace_users wu WHERE ((wu.id = workspace_user_linked_users.virtual_user_id) AND (wu.ws_id = workspace_user_linked_users.ws_id))))));

ALTER POLICY "Allow select for workspace users" ON public.workspace_user_linked_users
    USING ((((platform_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.user_id = workspace_user_linked_users.platform_user_id) AND (wm.ws_id = workspace_user_linked_users.ws_id))))) AND (EXISTS ( SELECT 1 FROM workspace_users wu WHERE ((wu.id = workspace_user_linked_users.virtual_user_id) AND (wu.ws_id = workspace_user_linked_users.ws_id))))));

ALTER POLICY "Allow workspace members to view profile link submissions" ON public.workspace_user_profile_link_submissions
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow members to create profile links" ON public.workspace_user_profile_links
    WITH CHECK ((ws_id IN ( SELECT wrp.ws_id FROM (workspace_role_members wrm JOIN workspace_role_permissions wrp ON (((wrp.role_id = wrm.role_id) AND (wrp.ws_id = workspace_user_profile_links.ws_id)))) WHERE ((wrm.user_id = (select auth.uid())) AND (wrp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wrp.enabled = true)) UNION SELECT wdp.ws_id FROM workspace_default_permissions wdp WHERE ((wdp.ws_id = workspace_user_profile_links.ws_id) AND (wdp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wdp.enabled = true) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_user_profile_links.ws_id) AND (wm.user_id = (select auth.uid())))))))));

ALTER POLICY "Allow members to delete profile links" ON public.workspace_user_profile_links
    USING ((ws_id IN ( SELECT wrp.ws_id FROM (workspace_role_members wrm JOIN workspace_role_permissions wrp ON (((wrp.role_id = wrm.role_id) AND (wrp.ws_id = workspace_user_profile_links.ws_id)))) WHERE ((wrm.user_id = (select auth.uid())) AND (wrp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wrp.enabled = true)) UNION SELECT wdp.ws_id FROM workspace_default_permissions wdp WHERE ((wdp.ws_id = workspace_user_profile_links.ws_id) AND (wdp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wdp.enabled = true) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_user_profile_links.ws_id) AND (wm.user_id = (select auth.uid())))))))));

ALTER POLICY "Allow members to update profile links" ON public.workspace_user_profile_links
    USING ((ws_id IN ( SELECT wrp.ws_id FROM (workspace_role_members wrm JOIN workspace_role_permissions wrp ON (((wrp.role_id = wrm.role_id) AND (wrp.ws_id = workspace_user_profile_links.ws_id)))) WHERE ((wrm.user_id = (select auth.uid())) AND (wrp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wrp.enabled = true)) UNION SELECT wdp.ws_id FROM workspace_default_permissions wdp WHERE ((wdp.ws_id = workspace_user_profile_links.ws_id) AND (wdp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wdp.enabled = true) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_user_profile_links.ws_id) AND (wm.user_id = (select auth.uid())))))))))
    WITH CHECK ((ws_id IN ( SELECT wrp.ws_id FROM (workspace_role_members wrm JOIN workspace_role_permissions wrp ON (((wrp.role_id = wrm.role_id) AND (wrp.ws_id = workspace_user_profile_links.ws_id)))) WHERE ((wrm.user_id = (select auth.uid())) AND (wrp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wrp.enabled = true)) UNION SELECT wdp.ws_id FROM workspace_default_permissions wdp WHERE ((wdp.ws_id = workspace_user_profile_links.ws_id) AND (wdp.permission = 'manage_user_profile_links'::workspace_role_permission) AND (wdp.enabled = true) AND (EXISTS ( SELECT 1 FROM workspace_members wm WHERE ((wm.ws_id = workspace_user_profile_links.ws_id) AND (wm.user_id = (select auth.uid())))))))));

ALTER POLICY "Allow workspace members to view profile links" ON public.workspace_user_profile_links
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow member managers to manage status changes" ON public.workspace_user_status_changes
    USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text))
    WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

ALTER POLICY "Enable read access for organization members" ON public.workspace_user_status_changes
    USING (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Enable all access for workspace members" ON public.workspace_users
    USING (is_org_member((select auth.uid()), ws_id))
    WITH CHECK (is_org_member((select auth.uid()), ws_id));

ALTER POLICY "Allow workspace settings managers to delete" ON public.workspaces
    USING (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND (NOT has_workspace_secret(id, 'PREVENT_WORKSPACE_DELETION'::text)) AND has_workspace_permission(id, (select auth.uid()), 'manage_workspace_settings'::text)));

ALTER POLICY "Allow workspace settings managers to update" ON public.workspaces
    USING (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND has_workspace_permission(id, (select auth.uid()), 'manage_workspace_settings'::text)))
    WITH CHECK (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND has_workspace_permission(id, (select auth.uid()), 'manage_workspace_settings'::text)));

ALTER POLICY "Enable insert for authenticated users only" ON public.workspaces
    WITH CHECK (((creator_id = (select auth.uid())) AND (is_tuturuuu_email(( SELECT user_private_details.email FROM user_private_details WHERE (user_private_details.user_id = (select auth.uid())))) OR (count_user_workspaces((select auth.uid())) < 10))));

ALTER POLICY "Enable insert with creator and creation permission check" ON public.workspaces
    WITH CHECK (((creator_id = (select auth.uid())) AND can_create_workspace((select auth.uid()))));

ALTER POLICY "Enable read access for organization members or invited members" ON public.workspaces
    USING ((is_org_member((select auth.uid()), id) OR is_member_invited((select auth.uid()), id) OR (EXISTS ( SELECT 1 FROM workspace_email_invites wei WHERE ((lower(wei.email) = lower((select auth.email()))) AND (wei.ws_id = workspaces.id)))) OR (creator_id = (select auth.uid()))));

ALTER POLICY "Enable update respecting personal workspace and roles" ON public.workspaces
    USING ((has_workspace_permission(id, (select auth.uid()), 'manage_workspace_settings'::text) AND ((personal = false) OR (get_workspace_member_count(id) = 1))))
    WITH CHECK ((has_workspace_permission(id, (select auth.uid()), 'manage_workspace_settings'::text) AND ((personal = false) OR (get_workspace_member_count(id) = 1))));
