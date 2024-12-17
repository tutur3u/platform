create or replace function create_workspace_user_linked_user() returns trigger as $$ begin if not exists (
        select 1
        from workspace_users wu
            join user_private_details up on wu.email = up.email
        where up.user_id = new.user_id
            and wu.ws_id = new.ws_id
    )
    and not exists (
        select 1
        from workspace_user_linked_users wul
        where wul.platform_user_id = new.user_id
            and wul.ws_id = new.ws_id
    ) then
insert into workspace_users (id, ws_id, display_name, email)
select uuid_generate_v4(),
    new.ws_id,
    u.display_name,
    up.email
from users u
    join user_private_details up on up.user_id = u.id
where u.id = new.user_id;
insert into workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
select new.user_id,
    wu.id,
    new.ws_id
from workspace_users wu
    join user_private_details up on up.email = wu.email
where up.user_id = new.user_id
    and wu.ws_id = new.ws_id;
end if;
return new;
end;
$$ language plpgsql;