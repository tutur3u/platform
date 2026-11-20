set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy "Allow all access for workspace member" on public.workspace_flashcards;

create policy workspace_flashcards_select_members
  on public.workspace_flashcards for select to authenticated
  using (public.is_org_member((select auth.uid()), ws_id));

create policy workspace_flashcards_write_group_managers
  on public.workspace_flashcards for all to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups'))
  with check (public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups'));

drop policy "Allow all access for workspace member" on public.course_module_flashcards;

create policy course_module_flashcards_select_members
  on public.course_module_flashcards for select to authenticated
  using (
    exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as course on course.id = module.group_id
      join public.workspace_flashcards as card
        on card.id = course_module_flashcards.flashcard_id and card.ws_id = course.ws_id
      where module.id = course_module_flashcards.module_id
    )
  );

create policy course_module_flashcards_write_group_managers
  on public.course_module_flashcards for all to authenticated
  using (
    exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as course on course.id = module.group_id
      join public.workspace_flashcards as card
        on card.id = course_module_flashcards.flashcard_id and card.ws_id = course.ws_id
      where module.id = course_module_flashcards.module_id
        and public.has_workspace_permission(course.ws_id, (select auth.uid()), 'update_user_groups')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_course_modules as module
      join public.workspace_user_groups as course on course.id = module.group_id
      join public.workspace_flashcards as card
        on card.id = course_module_flashcards.flashcard_id and card.ws_id = course.ws_id
      where module.id = course_module_flashcards.module_id
        and public.has_workspace_permission(course.ws_id, (select auth.uid()), 'update_user_groups')
    )
  );

drop policy user_indicators_select_workspace_members on public.user_indicators;

create policy user_indicators_select_subject_or_score_viewer
  on public.user_indicators for select to authenticated
  using (
    exists (
      select 1
      from public.user_group_metrics as metric
      where metric.id = user_indicators.indicator_id
        and (
          public.has_workspace_permission(metric.ws_id, (select auth.uid()), 'view_user_groups_scores')
          or (
            public.is_org_member((select auth.uid()), metric.ws_id)
            and exists (
              select 1
              from public.workspace_user_linked_users as link
              where link.ws_id = metric.ws_id
                and link.virtual_user_id = user_indicators.user_id
                and link.platform_user_id = (select auth.uid())
            )
          )
        )
    )
  );
