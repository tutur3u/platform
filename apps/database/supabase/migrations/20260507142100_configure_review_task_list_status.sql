update public.task_board_status_templates
set statuses = '[
  {"status": "not_started", "name": "To Do", "color": "GRAY", "allow_multiple": true},
  {"status": "active", "name": "In Progress", "color": "BLUE", "allow_multiple": true},
  {"status": "review", "name": "Review", "color": "ORANGE", "allow_multiple": true},
  {"status": "done", "name": "Done", "color": "GREEN", "allow_multiple": true},
  {"status": "closed", "name": "Closed", "color": "PURPLE", "allow_multiple": false}
]'::jsonb
where name = 'Basic Kanban';

update public.task_board_status_templates
set statuses = '[
  {"status": "not_started", "name": "Backlog", "color": "GRAY", "allow_multiple": true},
  {"status": "not_started", "name": "Sprint Ready", "color": "YELLOW", "allow_multiple": true},
  {"status": "active", "name": "In Development", "color": "BLUE", "allow_multiple": true},
  {"status": "review", "name": "Code Review", "color": "ORANGE", "allow_multiple": true},
  {"status": "review", "name": "Testing", "color": "CYAN", "allow_multiple": true},
  {"status": "done", "name": "Done", "color": "GREEN", "allow_multiple": true},
  {"status": "closed", "name": "Archived", "color": "PURPLE", "allow_multiple": false}
]'::jsonb
where name = 'Software Development';

update public.task_board_status_templates
set statuses = '[
  {"status": "not_started", "name": "Ideas", "color": "GRAY", "allow_multiple": true},
  {"status": "not_started", "name": "Research", "color": "YELLOW", "allow_multiple": true},
  {"status": "active", "name": "Writing", "color": "BLUE", "allow_multiple": true},
  {"status": "active", "name": "Editing", "color": "CYAN", "allow_multiple": true},
  {"status": "review", "name": "Review", "color": "ORANGE", "allow_multiple": true},
  {"status": "done", "name": "Published", "color": "GREEN", "allow_multiple": true},
  {"status": "closed", "name": "Archived", "color": "PURPLE", "allow_multiple": false}
]'::jsonb
where name = 'Content Creation';

create or replace function public.create_default_lists_from_template()
returns trigger as $$
declare
    template_record record;
    status_item jsonb;
    position_counter integer := 0;
begin
    if new.template_id is not null then
        select * into template_record
        from public.task_board_status_templates
        where id = new.template_id;

        for status_item in select * from jsonb_array_elements(template_record.statuses)
        loop
            insert into public.task_lists (
                board_id,
                name,
                status,
                color,
                position
            ) values (
                new.id,
                status_item->>'name',
                (status_item->>'status')::public.task_board_status,
                status_item->>'color',
                position_counter
            );
            position_counter := position_counter + 1;
        end loop;
    else
        insert into public.task_lists (board_id, name, status, color, position) values
        (new.id, 'To Do', 'not_started', 'GRAY', 0),
        (new.id, 'In Progress', 'active', 'BLUE', 1),
        (new.id, 'Review', 'review', 'ORANGE', 2),
        (new.id, 'Done', 'done', 'GREEN', 3),
        (new.id, 'Closed', 'closed', 'PURPLE', 4);
    end if;

    return new;
end;
$$ language plpgsql;

create or replace function public.set_task_timestamps()
returns trigger as $$
declare
  new_list_status text;
begin
  if new.list_id is not null then
    select status into new_list_status
    from public.task_lists
    where id = new.list_id;

    case new_list_status
      when 'review', 'done' then
        if new.completed_at is null then
          new.completed_at = now();
        end if;
        new.completed = true;
        new.closed_at = null;

      when 'closed' then
        if new.closed_at is null then
          new.closed_at = now();
        end if;
        new.completed = false;
        new.completed_at = null;

      when 'documents', 'active', 'not_started' then
        new.completed = false;
        new.completed_at = null;
        new.closed_at = null;

      else
        new.completed = false;
        new.completed_at = null;
        new.closed_at = null;
    end case;
  end if;

  return new;
end;
$$ language plpgsql;
