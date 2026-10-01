-- Source proposal only: apply exclusively after isolated-fixture admission.
-- Browser roles never receive direct access to hidden judge cases.
create table private.learn_programming_problems (
    id uuid primary key default gen_random_uuid(),
    ws_id uuid references public.workspaces(id) on delete cascade,
    slug text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
    title jsonb not null,
    prompt jsonb not null,
    difficulty text not null check (difficulty in ('easy', 'medium')),
    topic text not null check (topic in ('arrays', 'search', 'stacks')),
    starter_code text not null default '' check (length(starter_code) <= 16000),
    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),
    revision bigint not null default 1 check (revision > 0),
    created_by uuid references public.users(id) on delete set null,
    updated_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (ws_id, slug),
    constraint programming_title_locales check (
        jsonb_typeof(title) = 'object'
        and title ?& array['en', 'vi']
        and title - 'en' - 'vi' = '{}'::jsonb
        and jsonb_typeof(title -> 'en') = 'string'
        and jsonb_typeof(title -> 'vi') = 'string'
        and length(btrim(title ->> 'en')) between 1 and 255
        and length(btrim(title ->> 'vi')) between 1 and 255
    ),
    constraint programming_prompt_locales check (
        jsonb_typeof(prompt) = 'object'
        and prompt ?& array['en', 'vi']
        and prompt - 'en' - 'vi' = '{}'::jsonb
        and jsonb_typeof(prompt -> 'en') = 'string'
        and jsonb_typeof(prompt -> 'vi') = 'string'
        and length(btrim(prompt ->> 'en')) between 1 and 16000
        and length(btrim(prompt ->> 'vi')) between 1 and 16000
    )
);

create index learn_programming_problems_workspace_status
    on private.learn_programming_problems(ws_id, status, created_at, id);

create table private.learn_programming_problem_cases (
    problem_id uuid not null references private.learn_programming_problems(id)
        on delete cascade,
    position integer not null check (position >= 0 and position < 50),
    input text not null check (length(input) <= 4096),
    expected text not null check (length(expected) <= 4096),
    visible boolean not null default false,
    primary key (problem_id, position)
);

alter table private.learn_programming_problems enable row level security;
alter table private.learn_programming_problem_cases enable row level security;
revoke all on private.learn_programming_problems from public, anon, authenticated;
revoke all on private.learn_programming_problem_cases from public, anon, authenticated;
grant select, insert, update, delete on private.learn_programming_problems to service_role;
grant select, insert, update, delete on private.learn_programming_problem_cases to service_role;

-- Preserve old records and the old enqueue RPC during rollout. New execution
-- identity is stamped by a separate versioned, authorized enqueue contract.
alter table private.learn_coding_submissions
    add column problem_id uuid references private.learn_programming_problems(id) on delete set null,
    add column problem_revision bigint check (problem_revision > 0),
    add column problem_bound boolean not null default false,
    add constraint learn_coding_submissions_problem_binding
        check (problem_id is null or problem_bound);

-- problem_bound remains true after SET NULL: deleted workspace/problem submissions
-- preserve history without being reclassified as unbound legacy slug executions.

-- A single SQL statement provides one MVCC snapshot for row + cases. This RPC
-- is service-only; caller must prove the distinct learner/author app permission.
create function private.read_learn_programming_problem(
    p_ws_id uuid, p_problem_id uuid, p_author boolean default false
) returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'problem', to_jsonb(problem),
        'cases', coalesce((
            select jsonb_agg(to_jsonb(test_case) order by test_case.position)
            from private.learn_programming_problem_cases test_case
            where test_case.problem_id = problem.id
                and (test_case.visible or (p_author and problem.ws_id = p_ws_id))
        ), '[]'::jsonb)
    )
    from private.learn_programming_problems problem
    where problem.id = p_problem_id
        and (problem.ws_id = p_ws_id or problem.ws_id is null)
        and (problem.status = 'published' or (p_author and problem.ws_id = p_ws_id));
$$;
revoke all on function private.read_learn_programming_problem(uuid, uuid, boolean)
    from public, anon, authenticated;
grant execute on function private.read_learn_programming_problem(uuid, uuid, boolean)
    to service_role;

create function private.save_learn_programming_problem(
    p_ws_id uuid, p_actor_id uuid, p_problem jsonb,
    p_problem_id uuid default null, p_expected_revision bigint default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_problem private.learn_programming_problems;
    v_case jsonb;
    v_position integer := 0;
begin
    -- API checks manage_users plus education and real session before calling.
    if not exists (select 1 from public.workspace_members
        where ws_id = p_ws_id and user_id = p_actor_id) then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;
    if jsonb_typeof(p_problem -> 'cases') is distinct from 'array'
        or jsonb_array_length(p_problem -> 'cases') not between 1 and 50
        or not exists (select 1 from jsonb_array_elements(p_problem -> 'cases') c
            where c -> 'visible' = 'true'::jsonb) then
        raise exception 'Invalid problem cases' using errcode = '22023';
    end if;
    if p_problem_id is null then
        if p_expected_revision is not null then
            raise exception 'Invalid create revision' using errcode = '22023';
        end if;
        insert into private.learn_programming_problems (
            ws_id, slug, title, prompt, difficulty, topic, starter_code,
            status, created_by, updated_by
        ) values (
            p_ws_id, p_problem ->> 'slug', p_problem -> 'title', p_problem -> 'prompt',
            p_problem ->> 'difficulty', p_problem ->> 'topic', p_problem ->> 'starterCode',
            p_problem ->> 'status', p_actor_id, p_actor_id
        ) returning * into v_problem;
    else
        select * into v_problem from private.learn_programming_problems
            where id = p_problem_id and ws_id = p_ws_id for update;
        if not found then
            raise exception 'Problem not found' using errcode = 'P0002';
        end if;
        if p_expected_revision is null or v_problem.revision <> p_expected_revision then
            raise exception 'Problem revision conflict' using errcode = '40001';
        end if;
        update private.learn_programming_problems set
            slug = p_problem ->> 'slug', title = p_problem -> 'title',
            prompt = p_problem -> 'prompt', difficulty = p_problem ->> 'difficulty',
            topic = p_problem ->> 'topic', starter_code = p_problem ->> 'starterCode',
            status = p_problem ->> 'status', revision = revision + 1,
            updated_by = p_actor_id, updated_at = now()
            where id = p_problem_id and ws_id = p_ws_id returning * into v_problem;
        delete from private.learn_programming_problem_cases where problem_id = v_problem.id;
    end if;
    for v_case in select value from jsonb_array_elements(p_problem -> 'cases') loop
        insert into private.learn_programming_problem_cases(problem_id, position, input, expected, visible)
            values (v_problem.id, v_position, v_case ->> 'input', v_case ->> 'expected', (v_case ->> 'visible')::boolean);
        v_position := v_position + 1;
    end loop;
    return to_jsonb(v_problem);
end;
$$;
revoke all on function private.save_learn_programming_problem(uuid, uuid, jsonb, uuid, bigint)
    from public, anon, authenticated;
grant execute on function private.save_learn_programming_problem(uuid, uuid, jsonb, uuid, bigint)
    to service_role;

alter table private.learn_coding_submissions add constraint learn_coding_submissions_bound_revision
    check (not problem_bound or problem_revision is not null);
create function private.preserve_learn_programming_submission_binding()
returns trigger language plpgsql set search_path = '' as $$
begin
    if old.problem_bound and (
        not new.problem_bound or new.problem_revision is distinct from old.problem_revision
        or (new.problem_id is not null and new.problem_id is distinct from old.problem_id)
    ) then
        raise exception 'Programming submission binding is immutable' using errcode = '22023';
    end if;
    return new;
end;
$$;
revoke all on function private.preserve_learn_programming_submission_binding()
    from public, anon, authenticated;
create trigger preserve_learn_programming_submission_binding
    before update of problem_id, problem_revision, problem_bound
    on private.learn_coding_submissions for each row
    execute function private.preserve_learn_programming_submission_binding();

-- Caller builds command from read_learn_programming_problem snapshot. A matching
-- expected revision under this lock proves no author edit/archive intervened.
-- The original enqueue performs all unchanged rate/runner/envelope checks in the
-- same transaction; stamping failure rolls back the original enqueue as well.
create function private.enqueue_learn_programming_execution(
    p_ws_id uuid, p_actor_id uuid, p_user_id uuid, p_problem_id uuid,
    p_expected_revision bigint, p_source text, p_command text[],
    p_language text, p_kind text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_problem private.learn_programming_problems;
    v_submission_id uuid;
begin
    if p_actor_id is distinct from p_user_id
        or not exists (select 1 from public.workspace_user_linked_users
            where ws_id = p_ws_id and platform_user_id = p_user_id)
        or not exists (select 1 from public.workspace_secrets
            where ws_id = p_ws_id and name = 'ENABLE_EDUCATION'
                and lower(btrim(value)) = 'true') then
        raise exception 'Learner execution is forbidden' using errcode = '42501';
    end if;
    select * into v_problem from private.learn_programming_problems
        where id = p_problem_id and (ws_id = p_ws_id or ws_id is null)
        for share;
    if not found then raise exception 'Problem not found' using errcode = 'P0002'; end if;
    if v_problem.revision is distinct from p_expected_revision
        or v_problem.status <> 'published' then
        raise exception 'Problem revision conflict' using errcode = '40001';
    end if;
    v_submission_id := private.enqueue_learn_coding_execution(
        p_ws_id, p_user_id, v_problem.slug, p_source, p_command, p_language, p_kind
    );
    update private.learn_coding_submissions set
        problem_id = v_problem.id, problem_revision = p_expected_revision,
        problem_bound = true
        where id = v_submission_id and ws_id = p_ws_id and user_id = p_user_id;
    if not found then raise exception 'Submission binding failed'; end if;
    return v_submission_id;
end;
$$;
revoke all on function private.enqueue_learn_programming_execution(
    uuid, uuid, uuid, uuid, bigint, text, text[], text, text
) from public, anon, authenticated;
grant execute on function private.enqueue_learn_programming_execution(
    uuid, uuid, uuid, uuid, bigint, text, text[], text, text
) to service_role;

-- Separate execution-only snapshot; never return this shape through catalog APIs.
create function private.read_learn_programming_execution(p_ws_id uuid, p_problem_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('problem', to_jsonb(problem), 'cases', coalesce((
        select jsonb_agg(to_jsonb(test_case) order by test_case.position)
        from private.learn_programming_problem_cases test_case
        where test_case.problem_id = problem.id
    ), '[]'::jsonb)) from private.learn_programming_problems problem
    where problem.id = p_problem_id and problem.status = 'published'
        and (problem.ws_id = p_ws_id or problem.ws_id is null);
$$;
revoke all on function private.read_learn_programming_execution(uuid, uuid)
    from public, anon, authenticated;
grant execute on function private.read_learn_programming_execution(uuid, uuid) to service_role;

-- Exact audited existing non-customer catalog; no submission backfill.
-- Original challenge source SHA256 88de8c30c070449974098ec9a14954896c94f7aa0a346e4a8f3e708a1844e4ff
with catalog as (
 select * from jsonb_to_recordset($programming_catalog$[
  {
    "id": "ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1",
    "slug": "two-sum",
    "title": {
      "en": "Two Sum",
      "vi": "Tổng hai số"
    },
    "prompt": {
      "en": "Given a list of integers and a target, print the two zero-based indices whose values add up to the target, in ascending order. Exactly one answer exists.\n\nInput: n, then n space-separated integers, then the target.",
      "vi": "Cho một danh sách số nguyên và một số đích. In ra hai chỉ số bắt đầu từ 0 có tổng bằng số đích, theo thứ tự tăng dần. Luôn có đúng một đáp án.\n\nĐầu vào: n, tiếp theo là n số nguyên cách nhau bằng dấu cách, rồi đến số đích."
    },
    "difficulty": "easy",
    "topic": "arrays",
    "starter_code": "n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Print two zero-based indices in ascending order.\n",
    "cases": [
      {
        "input": "4\n2 7 11 15\n9\n",
        "expected": "0 1\n",
        "visible": true
      },
      {
        "input": "3\n3 2 4\n6\n",
        "expected": "1 2\n",
        "visible": true
      },
      {
        "input": "2\n3 3\n6\n",
        "expected": "0 1\n",
        "visible": false
      },
      {
        "input": "5\n-4 8 10 -1 3\n-5\n",
        "expected": "0 3\n",
        "visible": false
      }
    ]
  },
  {
    "id": "0d7a547a-c8c0-4061-884f-abc2e6058548",
    "slug": "binary-search",
    "title": {
      "en": "Binary Search",
      "vi": "Tìm kiếm nhị phân"
    },
    "prompt": {
      "en": "Given a sorted list of distinct integers and a target, print its zero-based index or -1 if it is absent.\n\nInput: n, then n space-separated integers, then the target.",
      "vi": "Cho một danh sách số nguyên phân biệt đã sắp xếp và một số đích. In ra chỉ số bắt đầu từ 0 của số đó, hoặc -1 nếu không có.\n\nĐầu vào: n, tiếp theo là n số nguyên cách nhau bằng dấu cách, rồi đến số đích."
    },
    "difficulty": "easy",
    "topic": "search",
    "starter_code": "n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Print the index of target, or -1.\n",
    "cases": [
      {
        "input": "5\n1 3 5 7 9\n7\n",
        "expected": "3\n",
        "visible": true
      },
      {
        "input": "5\n1 3 5 7 9\n2\n",
        "expected": "-1\n",
        "visible": true
      },
      {
        "input": "1\n42\n42\n",
        "expected": "0\n",
        "visible": false
      },
      {
        "input": "1\n42\n0\n",
        "expected": "-1\n",
        "visible": false
      }
    ]
  },
  {
    "id": "c7ce91a7-0aff-4097-90d2-716c17fa52d1",
    "slug": "balanced-brackets",
    "title": {
      "en": "Balanced Brackets",
      "vi": "Dấu ngoặc cân bằng"
    },
    "prompt": {
      "en": "Given a string containing only (), [], and {}, print YES if every opening bracket is closed in the correct order. Otherwise print NO.",
      "vi": "Cho một chuỗi chỉ gồm (), [] và {}. In YES nếu mọi dấu ngoặc mở được đóng đúng thứ tự. Ngược lại in NO."
    },
    "difficulty": "medium",
    "topic": "stacks",
    "starter_code": "brackets = input().strip()\n\n# Print YES when brackets are balanced, otherwise NO.\n",
    "cases": [
      {
        "input": "([]{})\n",
        "expected": "YES\n",
        "visible": true
      },
      {
        "input": "([)]\n",
        "expected": "NO\n",
        "visible": true
      },
      {
        "input": "((()))\n",
        "expected": "YES\n",
        "visible": false
      },
      {
        "input": "(()\n",
        "expected": "NO\n",
        "visible": false
      },
      {
        "input": "([{}])\n",
        "expected": "YES\n",
        "visible": false
      }
    ]
  }
]$programming_catalog$::jsonb)
 as fixture(id uuid, slug text, title jsonb, prompt jsonb, difficulty text, topic text, starter_code text, cases jsonb)
), inserted as (
 insert into private.learn_programming_problems(id, ws_id, slug, title, prompt, difficulty, topic, starter_code, status)
 select id, null, slug, title, prompt, difficulty, topic, starter_code, 'published' from catalog returning id
)
insert into private.learn_programming_problem_cases(problem_id, position, input, expected, visible)
select catalog.id, (test.ordinality - 1)::integer, test.value ->> 'input', test.value ->> 'expected', (test.value ->> 'visible')::boolean
from catalog join inserted on inserted.id = catalog.id
cross join lateral jsonb_array_elements(catalog.cases) with ordinality as test(value, ordinality);
