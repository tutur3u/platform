ALTER TYPE "public"."workspace_role_permission"
ADD VALUE IF NOT EXISTS 'manage_forms';

ALTER TYPE "public"."workspace_role_permission"
ADD VALUE IF NOT EXISTS 'view_form_analytics';

CREATE TABLE "public"."forms" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL,
  "creator_id" uuid NOT NULL DEFAULT auth.uid(),
  "title" text NOT NULL DEFAULT 'Untitled form',
  "description" text,
  "status" text NOT NULL DEFAULT 'draft',
  "access_mode" text NOT NULL DEFAULT 'anonymous',
  "open_at" timestamptz,
  "close_at" timestamptz,
  "published_at" timestamptz,
  "closed_at" timestamptz,
  "max_responses" integer,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "theme" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "forms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "forms_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "forms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "forms_status_check" CHECK ("status" IN ('draft', 'published', 'closed')),
  CONSTRAINT "forms_access_mode_check" CHECK ("access_mode" IN ('anonymous', 'authenticated', 'authenticated_email')),
  CONSTRAINT "forms_max_responses_check" CHECK ("max_responses" IS NULL OR "max_responses" > 0)
);

CREATE TABLE "public"."form_sections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "description" text,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_sections_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE
);

CREATE TABLE "public"."form_questions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "section_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "description" text,
  "required" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
  CONSTRAINT "form_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."form_sections"("id") ON DELETE CASCADE,
  CONSTRAINT "form_questions_type_check" CHECK (
    "type" IN (
      'short_text',
      'long_text',
      'single_choice',
      'multiple_choice',
      'dropdown',
      'linear_scale',
      'rating',
      'date',
      'time',
      'section_break'
    )
  )
);

CREATE TABLE "public"."form_question_options" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL,
  "label" text NOT NULL,
  "value" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  CONSTRAINT "form_question_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE CASCADE
);

CREATE TABLE "public"."form_logic_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "source_question_id" uuid NOT NULL,
  "operator" text NOT NULL DEFAULT 'equals',
  "comparison_value" text,
  "action_type" text NOT NULL DEFAULT 'go_to_section',
  "target_section_id" uuid,
  "priority" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_logic_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_logic_rules_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
  CONSTRAINT "form_logic_rules_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "public"."form_questions"("id") ON DELETE CASCADE,
  CONSTRAINT "form_logic_rules_target_section_id_fkey" FOREIGN KEY ("target_section_id") REFERENCES "public"."form_sections"("id") ON DELETE CASCADE,
  CONSTRAINT "form_logic_rules_operator_check" CHECK ("operator" IN ('equals', 'not_equals', 'contains')),
  CONSTRAINT "form_logic_rules_action_type_check" CHECK ("action_type" IN ('go_to_section', 'submit'))
);

CREATE TABLE "public"."form_share_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "code" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL DEFAULT auth.uid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_share_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_share_links_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
  CONSTRAINT "form_share_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "form_share_links_code_unique" UNIQUE ("code"),
  CONSTRAINT "form_share_links_form_unique" UNIQUE ("form_id")
);

CREATE TABLE "public"."form_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "share_link_id" uuid,
  "session_token" text NOT NULL,
  "respondent_user_id" uuid,
  "respondent_email" text,
  "viewed_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "submitted_at" timestamptz,
  "last_question_id" uuid,
  "last_section_id" uuid,
  "referrer_domain" text,
  "device_type" text,
  "browser" text,
  "os" text,
  "country" text,
  "city" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "form_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_sessions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
  CONSTRAINT "form_sessions_share_link_id_fkey" FOREIGN KEY ("share_link_id") REFERENCES "public"."form_share_links"("id") ON DELETE SET NULL,
  CONSTRAINT "form_sessions_respondent_user_id_fkey" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "form_sessions_last_question_id_fkey" FOREIGN KEY ("last_question_id") REFERENCES "public"."form_questions"("id") ON DELETE SET NULL,
  CONSTRAINT "form_sessions_last_section_id_fkey" FOREIGN KEY ("last_section_id") REFERENCES "public"."form_sections"("id") ON DELETE SET NULL
);

CREATE TABLE "public"."form_responses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "form_id" uuid NOT NULL,
  "share_link_id" uuid,
  "session_id" uuid,
  "respondent_user_id" uuid,
  "respondent_email" text,
  "completion_state" text NOT NULL DEFAULT 'submitted',
  "duration_seconds" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
  CONSTRAINT "form_responses_share_link_id_fkey" FOREIGN KEY ("share_link_id") REFERENCES "public"."form_share_links"("id") ON DELETE SET NULL,
  CONSTRAINT "form_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."form_sessions"("id") ON DELETE SET NULL,
  CONSTRAINT "form_responses_respondent_user_id_fkey" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "form_responses_completion_state_check" CHECK ("completion_state" IN ('submitted'))
);

CREATE TABLE "public"."form_response_answers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "response_id" uuid NOT NULL,
  "question_id" uuid,
  "question_title" text NOT NULL,
  "question_type" text NOT NULL,
  "answer_text" text,
  "answer_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_response_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_response_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."form_responses"("id") ON DELETE CASCADE,
  CONSTRAINT "form_response_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE SET NULL,
  CONSTRAINT "form_response_answers_unique" UNIQUE ("response_id", "question_id")
);

CREATE INDEX "forms_ws_id_idx" ON "public"."forms" ("ws_id");
CREATE INDEX "forms_status_idx" ON "public"."forms" ("status");
CREATE INDEX "form_sections_form_id_position_idx" ON "public"."form_sections" ("form_id", "position");
CREATE INDEX "form_questions_section_id_position_idx" ON "public"."form_questions" ("section_id", "position");
CREATE INDEX "form_question_options_question_id_position_idx" ON "public"."form_question_options" ("question_id", "position");
CREATE INDEX "form_logic_rules_form_id_source_question_id_idx" ON "public"."form_logic_rules" ("form_id", "source_question_id", "priority");
CREATE INDEX "form_sessions_form_id_viewed_at_idx" ON "public"."form_sessions" ("form_id", "viewed_at" DESC);
CREATE INDEX "form_sessions_form_id_submitted_at_idx" ON "public"."form_sessions" ("form_id", "submitted_at" DESC);
CREATE INDEX "form_sessions_session_token_idx" ON "public"."form_sessions" ("session_token");
CREATE INDEX "form_responses_form_id_submitted_at_idx" ON "public"."form_responses" ("form_id", "submitted_at" DESC);
CREATE INDEX "form_responses_form_id_respondent_user_id_idx" ON "public"."form_responses" ("form_id", "respondent_user_id");
CREATE INDEX "form_response_answers_question_id_idx" ON "public"."form_response_answers" ("question_id");

ALTER TABLE "public"."forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_question_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_logic_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_share_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_response_answers" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION "public"."get_form_workspace_id"(p_form_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ws_id
  FROM public.forms
  WHERE id = p_form_id;
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_form"(p_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forms f
    WHERE f.id = p_form_id
      AND (
        f.creator_id = auth.uid()
        OR public.has_workspace_permission(auth.uid(), f.ws_id, 'manage_forms')
      )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."can_view_form_analytics"(p_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forms f
    WHERE f.id = p_form_id
      AND (
        f.creator_id = auth.uid()
        OR public.has_workspace_permission(auth.uid(), f.ws_id, 'manage_forms')
        OR public.has_workspace_permission(auth.uid(), f.ws_id, 'view_form_analytics')
      )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."form_id_from_section"(p_section_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT form_id
  FROM public.form_sections
  WHERE id = p_section_id;
$$;

CREATE OR REPLACE FUNCTION "public"."form_id_from_question"(p_question_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT form_id
  FROM public.form_questions
  WHERE id = p_question_id;
$$;

CREATE OR REPLACE FUNCTION "public"."form_id_from_share_link"(p_share_link_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT form_id
  FROM public.form_share_links
  WHERE id = p_share_link_id;
$$;

CREATE OR REPLACE FUNCTION "public"."form_id_from_response"(p_response_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT form_id
  FROM public.form_responses
  WHERE id = p_response_id;
$$;

CREATE OR REPLACE FUNCTION "public"."touch_form_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "forms_touch_updated_at"
BEFORE UPDATE ON "public"."forms"
FOR EACH ROW
EXECUTE FUNCTION "public"."touch_form_updated_at"();

CREATE POLICY "Forms read access for managers and analysts"
ON "public"."forms"
FOR SELECT
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.has_workspace_permission(auth.uid(), ws_id, 'manage_forms')
  OR public.has_workspace_permission(auth.uid(), ws_id, 'view_form_analytics')
);

CREATE POLICY "Forms insert access for managers"
ON "public"."forms"
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  AND public.has_workspace_permission(auth.uid(), ws_id, 'manage_forms')
);

CREATE POLICY "Forms update access for managers"
ON "public"."forms"
FOR UPDATE
TO authenticated
USING (public.can_manage_form(id))
WITH CHECK (public.can_manage_form(id));

CREATE POLICY "Forms delete access for managers"
ON "public"."forms"
FOR DELETE
TO authenticated
USING (public.can_manage_form(id));

CREATE POLICY "Form sections read access"
ON "public"."form_sections"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form sections write access"
ON "public"."form_sections"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form questions read access"
ON "public"."form_questions"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form questions write access"
ON "public"."form_questions"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form question options read access"
ON "public"."form_question_options"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(public.form_id_from_question(question_id)));

CREATE POLICY "Form question options write access"
ON "public"."form_question_options"
FOR ALL
TO authenticated
USING (public.can_manage_form(public.form_id_from_question(question_id)))
WITH CHECK (public.can_manage_form(public.form_id_from_question(question_id)));

CREATE POLICY "Form logic read access"
ON "public"."form_logic_rules"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form logic write access"
ON "public"."form_logic_rules"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form share links read access"
ON "public"."form_share_links"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form share links write access"
ON "public"."form_share_links"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form sessions analytics access"
ON "public"."form_sessions"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form sessions manager access"
ON "public"."form_sessions"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form responses analytics access"
ON "public"."form_responses"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(form_id));

CREATE POLICY "Form responses manager access"
ON "public"."form_responses"
FOR ALL
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form response answers analytics access"
ON "public"."form_response_answers"
FOR SELECT
TO authenticated
USING (public.can_view_form_analytics(public.form_id_from_response(response_id)));

CREATE POLICY "Form response answers manager access"
ON "public"."form_response_answers"
FOR ALL
TO authenticated
USING (public.can_manage_form(public.form_id_from_response(response_id)))
WITH CHECK (public.can_manage_form(public.form_id_from_response(response_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."forms" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_sections" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_questions" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_question_options" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_logic_rules" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_share_links" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_sessions" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_responses" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."form_response_answers" TO authenticated;

GRANT ALL ON TABLE "public"."forms" TO service_role;
GRANT ALL ON TABLE "public"."form_sections" TO service_role;
GRANT ALL ON TABLE "public"."form_questions" TO service_role;
GRANT ALL ON TABLE "public"."form_question_options" TO service_role;
GRANT ALL ON TABLE "public"."form_logic_rules" TO service_role;
GRANT ALL ON TABLE "public"."form_share_links" TO service_role;
GRANT ALL ON TABLE "public"."form_sessions" TO service_role;
GRANT ALL ON TABLE "public"."form_responses" TO service_role;
GRANT ALL ON TABLE "public"."form_response_answers" TO service_role;

GRANT EXECUTE ON FUNCTION "public"."get_form_workspace_id"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."can_manage_form"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."can_view_form_analytics"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."form_id_from_section"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."form_id_from_question"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."form_id_from_share_link"(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."form_id_from_response"(uuid) TO authenticated, service_role;
