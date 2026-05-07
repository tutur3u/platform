alter type public.task_board_status add value if not exists 'review' after 'active';

comment on type public.task_board_status is
'Task list status types: not_started (Backlog), active (Active), review (Review/walkthrough), done (Done), closed (Closed), documents (Reference materials without completion tracking)';
