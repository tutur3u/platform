alter table
  "public"."nova_challenges"
add
  column "close_at" timestamp with time zone;

alter table
  "public"."nova_challenges"
add
  column "enabled" boolean not null default false;

alter table
  "public"."nova_challenges"
add
  column "open_at" timestamp with time zone;

alter table
  "public"."nova_challenges"
add
  column "previewable_at" timestamp with time zone;

alter table
  "public"."nova_challenges" enable row level security;

alter table
  "public"."nova_problem_testcases" enable row level security;

alter table
  "public"."nova_problems"
add
  column "scoring_criteria" text;

alter table
  "public"."nova_problems" enable row level security;

alter table
  "public"."nova_sessions" drop column "highest_score";

create policy "Enable all access for Nova Admins" on "public"."nova_challenges" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
);

create policy "Enable read access for normal users" on "public"."nova_challenges" as permissive for
select
  to authenticated using (
    (
      (
        EXISTS (
          SELECT
            1
          FROM
            nova_roles
          WHERE
            (
              (nova_roles.email = auth.email())
              AND (nova_roles.enabled = true)
            )
        )
      )
      AND (enabled = true)
      AND (
        (previewable_at IS NOT NULL)
        AND (previewable_at > now())
      )
    )
  );

create policy " Enable all access for Nova Admins" on "public"."nova_problem_testcases" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
);

create policy "Enable read access for normal users" on "public"."nova_problem_testcases" as permissive for
select
  to authenticated using (
    (
      EXISTS (
        SELECT
          1
        FROM
          nova_problems np
        WHERE
          (np.id = nova_problem_testcases.problem_id)
      )
    )
  );

create policy " Enable all access for Nova Admins" on "public"."nova_problems" as permissive for all to authenticated using (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
) with check (
  (
    EXISTS (
      SELECT
        1
      FROM
        nova_roles
      WHERE
        (
          (nova_roles.email = auth.email())
          AND (nova_roles.is_admin = true)
        )
    )
  )
);

create policy "Enable read access for normal users" on "public"."nova_problems" as permissive for
select
  to authenticated using (
    (
      (
        EXISTS (
          SELECT
            1
          FROM
            nova_roles
          WHERE
            (
              (nova_roles.email = auth.email())
              AND (nova_roles.enabled = true)
            )
        )
      )
      AND (
        EXISTS (
          SELECT
            1
          FROM
            nova_challenges nc
          WHERE
            (
              (nc.id = nova_problems.challenge_id)
              AND (nc.previewable_at > now())
              AND (nc.open_at > now())
            )
        )
      )
    )
  );

create policy "Enable all access for Nova Admins" on "public"."nova_roles" as permissive for all to authenticated using (
  (
    (email = auth.email())
    AND (is_admin = true)
    AND (enabled = true)
  )
) with check (
  (
    (email = auth.email())
    AND (is_admin = true)
    AND (enabled = true)
  )
);