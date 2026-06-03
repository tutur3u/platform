drop policy if exists "Learners can view own Tulearn state"
on public.tulearn_learner_state;

drop policy if exists "Learners can insert own Tulearn state"
on public.tulearn_learner_state;

drop policy if exists "Learners can update own Tulearn state"
on public.tulearn_learner_state;

create policy "Learners can view own Tulearn state"
on public.tulearn_learner_state
for select
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = tulearn_learner_state.ws_id
      and wm.user_id = auth.uid()
  )
);

create policy "Learners can insert own Tulearn state"
on public.tulearn_learner_state
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = tulearn_learner_state.ws_id
      and wm.user_id = auth.uid()
  )
  and (
    selected_workspace_id is null
    or exists (
      select 1
      from public.workspace_members selected_wm
      where selected_wm.ws_id = tulearn_learner_state.selected_workspace_id
        and selected_wm.user_id = auth.uid()
    )
  )
);

create policy "Learners can update own Tulearn state"
on public.tulearn_learner_state
for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = tulearn_learner_state.ws_id
      and wm.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = tulearn_learner_state.ws_id
      and wm.user_id = auth.uid()
  )
  and (
    selected_workspace_id is null
    or exists (
      select 1
      from public.workspace_members selected_wm
      where selected_wm.ws_id = tulearn_learner_state.selected_workspace_id
        and selected_wm.user_id = auth.uid()
    )
  )
);
