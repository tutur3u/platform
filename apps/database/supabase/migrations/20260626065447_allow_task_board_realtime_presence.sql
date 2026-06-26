drop policy if exists "task realtime private channels are scoped"
on realtime.messages;

create policy "task realtime private channels are scoped"
on realtime.messages
for select
to authenticated
using (
  private = true
  and private.can_join_task_realtime_topic(realtime.topic(), auth.uid())
  and (
    extension = 'broadcast'
    or (
      extension = 'presence'
      and realtime.topic() like 'board-realtime-%'
    )
  )
);
