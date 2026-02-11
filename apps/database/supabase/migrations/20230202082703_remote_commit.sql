--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1
-- Dumped by pg_dump version 15.1 (Debian 15.1-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";


--
-- Name: pgsodium; Type: EXTENSION; Schema: -; Owner: -
--

-- CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA "public" OWNER TO "postgres";

--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: pgjwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: add_org_creator(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."add_org_creator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  insert into public.org_members(org_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$$;


ALTER FUNCTION "public"."add_org_creator"() OWNER TO "postgres";

--
-- Name: add_task_board_creator(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."add_task_board_creator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  insert into public.task_board_members(board_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$$;


ALTER FUNCTION "public"."add_task_board_creator"() OWNER TO "postgres";

--
-- Name: create_profile_for_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_profile_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;$$;


ALTER FUNCTION "public"."create_profile_for_new_user"() OWNER TO "postgres";

--
-- Name: delete_invite_when_accepted(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."delete_invite_when_accepted"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin
delete FROM
  public.org_invites i
WHERE
  i.org_id = new.org_id
  AND i.user_id = new.user_id;
return new;
end;$$;


ALTER FUNCTION "public"."delete_invite_when_accepted"() OWNER TO "postgres";

--
-- Name: get_user_tasks("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_user_tasks"("_board_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "priority" smallint, "completed" boolean, "start_date" timestamp with time zone, "end_date" timestamp with time zone, "list_id" "uuid", "board_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
	begin
		return query
			select t.id, t.name, t.description, t.priority, t.completed, t.start_date, t.end_date, t.list_id, l.board_id
      from tasks t, task_lists l, task_assignees a
      where auth.uid() = a.user_id and
      l.board_id = _board_id and
      t.list_id = l.id and
      t.id = a.task_id and
      t.completed = false
      order by t.priority DESC, t.end_date ASC NULLS LAST;
	end;
$$;


ALTER FUNCTION "public"."get_user_tasks"("_board_id" "uuid") OWNER TO "postgres";

--
-- Name: is_list_accessible("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_list_accessible"("_list_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM task_lists tl
  WHERE tl.id = _list_id
);
$$;


ALTER FUNCTION "public"."is_list_accessible"("_list_id" "uuid") OWNER TO "postgres";

--
-- Name: is_member_invited("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_member_invited"("_user_id" "uuid", "_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM org_invites oi
  WHERE oi.org_id = _org_id
  AND oi.user_id = _user_id
);
$$;


ALTER FUNCTION "public"."is_member_invited"("_user_id" "uuid", "_org_id" "uuid") OWNER TO "postgres";

--
-- Name: is_org_member("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_org_member"("_user_id" "uuid", "_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM org_members om
  WHERE om.org_id = _org_id
  AND om.user_id = _user_id
);
$$;


ALTER FUNCTION "public"."is_org_member"("_user_id" "uuid", "_org_id" "uuid") OWNER TO "postgres";

--
-- Name: is_task_accessible("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_task_accessible"("_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM tasks
  WHERE tasks.id = _task_id
);
$$;


ALTER FUNCTION "public"."is_task_accessible"("_task_id" "uuid") OWNER TO "postgres";

--
-- Name: is_task_board_member("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_task_board_member"("_user_id" "uuid", "_board_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM task_board_members tbm
  WHERE tbm.board_id = _board_id
  AND tbm.user_id = _user_id
);
$$;


ALTER FUNCTION "public"."is_task_board_member"("_user_id" "uuid", "_board_id" "uuid") OWNER TO "postgres";

--
-- Name: is_user_task_in_board("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
  SELECT 1
  FROM task_board_members tbm, tasks, task_lists lists
  WHERE tasks.id = _task_id
  AND lists.id = tasks.list_id
  AND tbm.board_id = lists.board_id
  AND tbm.user_id = _user_id
);
$$;


ALTER FUNCTION "public"."is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid") OWNER TO "postgres";

--
-- Name: search_users_by_name(character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."search_users_by_name"("search_query" character varying) RETURNS TABLE("id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "plpgsql"
    AS $$
	begin
		return query
			SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar_url
      FROM
        public.users u
      WHERE search_query % ANY(STRING_TO_ARRAY(u.username, ' '))
      OR search_query % ANY(STRING_TO_ARRAY(u.display_name, ' '))
      OR search_query % ANY(STRING_TO_ARRAY(u.email, ' '))
      ORDER BY u.created_at
      LIMIT 5;
	end;
$$;


ALTER FUNCTION "public"."search_users_by_name"("search_query" character varying) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: org_boards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."org_boards" (
    "org_id" "uuid" NOT NULL,
    "board_id" "uuid" NOT NULL
);


ALTER TABLE "public"."org_boards" OWNER TO "postgres";

--
-- Name: org_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."org_invites" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."org_invites" OWNER TO "postgres";

--
-- Name: org_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."org_members" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."org_members" OWNER TO "postgres";

--
-- Name: orgs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orgs" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";

--
-- Name: personal_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."personal_notes" (
    "user_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."personal_notes" OWNER TO "postgres";

--
-- Name: project_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."project_members" (
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."projects" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";

--
-- Name: task_assignees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."task_assignees" (
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";

--
-- Name: task_board_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."task_board_members" (
    "board_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_board_members" OWNER TO "postgres";

--
-- Name: task_boards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."task_boards" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text",
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creator_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."task_boards" OWNER TO "postgres";

--
-- Name: task_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."task_lists" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text",
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "board_id" "uuid" NOT NULL,
    "creator_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."task_lists" OWNER TO "postgres";

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tasks" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "archived" boolean DEFAULT false,
    "deleted" boolean DEFAULT false,
    "list_id" "uuid" NOT NULL,
    "completed" boolean DEFAULT false,
    "creator_id" "uuid" DEFAULT "auth"."uid"(),
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "description" "text",
    "priority" smallint
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."team_members" (
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";

--
-- Name: team_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."team_projects" (
    "team_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."team_projects" OWNER TO "postgres";

--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."teams" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "org_id" "uuid",
    "username" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."teams" OWNER TO "postgres";

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."users" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "username" "text",
    "display_name" "text",
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text" NOT NULL,
    "avatar_url" "text",
    "birthday" "date"
);


ALTER TABLE "public"."users" OWNER TO "postgres";

--
-- Name: org_boards org_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_boards"
    ADD CONSTRAINT "org_boards_pkey" PRIMARY KEY ("org_id", "board_id");


--
-- Name: org_invites org_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("org_id", "user_id");


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_pkey" PRIMARY KEY ("org_id", "user_id");


--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");


--
-- Name: personal_notes personal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."personal_notes"
    ADD CONSTRAINT "personal_notes_pkey" PRIMARY KEY ("user_id", "owner_id");


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id");


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");


--
-- Name: task_assignees task_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id");


--
-- Name: task_board_members task_board_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_board_members"
    ADD CONSTRAINT "task_board_members_pkey" PRIMARY KEY ("board_id", "user_id");


--
-- Name: task_boards task_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_boards"
    ADD CONSTRAINT "task_boards_pkey" PRIMARY KEY ("id");


--
-- Name: task_lists task_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_lists"
    ADD CONSTRAINT "task_lists_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");


--
-- Name: team_projects team_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_projects"
    ADD CONSTRAINT "team_projects_pkey" PRIMARY KEY ("team_id", "project_id");


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");


--
-- Name: orgs add_org_creator_tr; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "add_org_creator_tr" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."add_org_creator"();


--
-- Name: task_boards add_task_board_creator_tr; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "add_task_board_creator_tr" AFTER INSERT ON "public"."task_boards" FOR EACH ROW EXECUTE FUNCTION "public"."add_task_board_creator"();


--
-- Name: org_members delete_invite_when_accepted_tr; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "delete_invite_when_accepted_tr" AFTER INSERT ON "public"."org_members" FOR EACH ROW EXECUTE FUNCTION "public"."delete_invite_when_accepted"();


--
-- Name: org_boards org_boards_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_boards"
    ADD CONSTRAINT "org_boards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."task_boards"("id");


--
-- Name: org_boards org_boards_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_boards"
    ADD CONSTRAINT "org_boards_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");


--
-- Name: org_invites org_invites_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");


--
-- Name: org_invites org_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: org_members org_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: personal_notes personal_notes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."personal_notes"
    ADD CONSTRAINT "personal_notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");


--
-- Name: personal_notes personal_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."personal_notes"
    ADD CONSTRAINT "personal_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: projects projects_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");


--
-- Name: task_assignees task_assignees_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;


--
-- Name: task_assignees task_assignees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: task_board_members task_board_members_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_board_members"
    ADD CONSTRAINT "task_board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."task_boards"("id") ON DELETE CASCADE;


--
-- Name: task_board_members task_board_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_board_members"
    ADD CONSTRAINT "task_board_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: task_boards task_boards_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_boards"
    ADD CONSTRAINT "task_boards_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id");


--
-- Name: task_lists task_lists_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_lists"
    ADD CONSTRAINT "task_lists_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."task_boards"("id") ON DELETE CASCADE;


--
-- Name: task_lists task_lists_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."task_lists"
    ADD CONSTRAINT "task_lists_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id");


--
-- Name: tasks tasks_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id");


--
-- Name: tasks tasks_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."task_lists"("id") ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: team_projects team_projects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_projects"
    ADD CONSTRAINT "team_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."users"("id");


--
-- Name: team_projects team_projects_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_projects"
    ADD CONSTRAINT "team_projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");


--
-- Name: teams teams_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");


--
-- Name: personal_notes Enable access for note owners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable access for note owners" ON "public"."personal_notes" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: task_lists Enable all access for members of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for members of the task board" ON "public"."task_lists" TO "authenticated" USING ("public"."is_task_board_member"("auth"."uid"(), "board_id")) WITH CHECK ("public"."is_task_board_member"("auth"."uid"(), "board_id"));


--
-- Name: projects Enable all access for organization members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for organization members" ON "public"."projects" TO "authenticated" USING ("public"."is_org_member"("auth"."uid"(), "org_id")) WITH CHECK ("public"."is_org_member"("auth"."uid"(), "org_id"));


--
-- Name: tasks Enable all access for tasks in accessible task list; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for tasks in accessible task list" ON "public"."tasks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."task_lists" "tl"
  WHERE ("tl"."id" = "tasks"."list_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."task_lists" "tl"
  WHERE ("tl"."id" = "tasks"."list_id"))));


--
-- Name: task_boards Enable delete for members of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for members of the task board" ON "public"."task_boards" FOR DELETE TO "authenticated" USING ("public"."is_task_board_member"("auth"."uid"(), "id"));


--
-- Name: org_members Enable delete for organization members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for organization members" ON "public"."org_members" FOR DELETE TO "authenticated" USING ("public"."is_org_member"("auth"."uid"(), "org_id"));


--
-- Name: org_invites Enable delete for organization members and current user; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for organization members and current user" ON "public"."org_invites" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_org_member"("auth"."uid"(), "org_id")));


--
-- Name: orgs Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for users based on user_id" ON "public"."orgs" FOR DELETE TO "authenticated" USING ((("id" <> '00000000-0000-0000-0000-000000000000'::"uuid") AND (EXISTS ( SELECT "org_members"."user_id"
   FROM "public"."org_members"
  WHERE ("auth"."uid"() = "org_members"."user_id")))));


--
-- Name: task_assignees Enable delete for users who can access the task; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for users who can access the task" ON "public"."task_assignees" FOR DELETE USING ("public"."is_task_accessible"("task_id"));


--
-- Name: orgs Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON "public"."orgs" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: task_boards Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON "public"."task_boards" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: org_members Enable insert for invited members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for invited members" ON "public"."org_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_member_invited"("auth"."uid"(), "org_id"));


--
-- Name: org_invites Enable insert for organization members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for organization members" ON "public"."org_invites" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_org_member"("auth"."uid"(), "org_id") AND (NOT "public"."is_org_member"("user_id", "org_id"))));


--
-- Name: task_assignees Enable insert for users who can access the task; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for users who can access the task" ON "public"."task_assignees" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_task_accessible"("task_id") AND "public"."is_user_task_in_board"("user_id", "task_id")));


--
-- Name: users Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authenticated users" ON "public"."users" FOR SELECT TO "authenticated" USING (true);


--
-- Name: task_board_members Enable read access for members of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for members of the task board" ON "public"."task_board_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."is_task_board_member"("auth"."uid"(), "board_id")));


--
-- Name: task_boards Enable read access for members of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for members of the task board" ON "public"."task_boards" FOR SELECT TO "authenticated" USING ("public"."is_task_board_member"("auth"."uid"(), "id"));


--
-- Name: org_members Enable read access for organization members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for organization members" ON "public"."org_members" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("auth"."uid"(), "org_id"));


--
-- Name: org_invites Enable read access for organization members and current user; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for organization members and current user" ON "public"."org_invites" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_org_member"("auth"."uid"(), "org_id")));


--
-- Name: orgs Enable read access for organization members or invited members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for organization members or invited members" ON "public"."orgs" FOR SELECT TO "authenticated" USING (("public"."is_org_member"("auth"."uid"(), "id") OR "public"."is_member_invited"("auth"."uid"(), "id")));


--
-- Name: task_boards Enable read access for the creator of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for the creator of the task board" ON "public"."task_boards" FOR SELECT TO "authenticated" USING (("creator_id" = "auth"."uid"()));


--
-- Name: task_assignees Enable select for assignees who has access to the task; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for assignees who has access to the task" ON "public"."task_assignees" FOR SELECT TO "authenticated" USING ("public"."is_task_accessible"("task_id"));


--
-- Name: orgs Enable update for all organization members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable update for all organization members" ON "public"."orgs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT "org_members"."user_id"
   FROM "public"."org_members"
  WHERE ("auth"."uid"() = "org_members"."user_id")))) WITH CHECK ((EXISTS ( SELECT "org_members"."user_id"
   FROM "public"."org_members"
  WHERE ("auth"."uid"() = "org_members"."user_id"))));


--
-- Name: task_boards Enable update for members of the task board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable update for members of the task board" ON "public"."task_boards" FOR UPDATE TO "authenticated" USING ("public"."is_task_board_member"("auth"."uid"(), "id")) WITH CHECK ("public"."is_task_board_member"("auth"."uid"(), "id"));


--
-- Name: users Enable update for users based on their uid; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable update for users based on their uid" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: org_boards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."org_boards" ENABLE ROW LEVEL SECURITY;

--
-- Name: org_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;

--
-- Name: org_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."org_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: orgs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;

--
-- Name: personal_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."personal_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_assignees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_board_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."task_board_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_boards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."task_boards" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_lists; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."task_lists" ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: team_projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."team_projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "net"; Type: ACL; Schema: -; Owner: supabase_admin
--

-- REVOKE ALL ON SCHEMA "net" FROM "supabase_admin";
-- GRANT USAGE ON SCHEMA "net" TO "supabase_functions_admin";
-- GRANT USAGE ON SCHEMA "net" TO "anon";
-- GRANT USAGE ON SCHEMA "net" TO "authenticated";
-- GRANT USAGE ON SCHEMA "net" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "gtrgm_in"("cstring"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";


--
-- Name: FUNCTION "gtrgm_out"("public"."gtrgm"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";


--
-- Name: FUNCTION "algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "armor"("bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."armor"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "armor"("bytea", "text"[], "text"[]); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."armor"("bytea", "text"[], "text"[]) TO "dashboard_user";


--
-- Name: FUNCTION "crypt"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."crypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "dearmor"("text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."dearmor"("text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."decrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."digest"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."digest"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."encrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."encrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_random_bytes"(integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."gen_random_bytes"(integer) TO "dashboard_user";


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION gen_random_uuid() TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."gen_salt"("text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text", integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."gen_salt"("text", integer) TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."hmac"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."hmac"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "blk_read_time" double precision, OUT "blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "blk_read_time" double precision, OUT "blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision) TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone) TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint) TO "dashboard_user";


--
-- Name: FUNCTION "pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_key_id"("bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_key_id"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "sign"("payload" "json", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."sign"("payload" "json", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "try_cast_double"("inp" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."try_cast_double"("inp" "text") TO "dashboard_user";


--
-- Name: FUNCTION "url_decode"("data" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."url_decode"("data" "text") TO "dashboard_user";


--
-- Name: FUNCTION "url_encode"("data" "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."url_encode"("data" "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1mc"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1mc"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v3"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_generate_v3"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION gen_random_uuid() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v5"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_generate_v5"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_nil"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_nil"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_dns"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_ns_dns"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_oid"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_ns_oid"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_url"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_ns_url"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_x500"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."uuid_ns_x500"() TO "dashboard_user";


--
-- Name: FUNCTION "verify"("token" "text", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "extensions"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "comment_directive"("comment_" "text"); Type: ACL; Schema: graphql; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "graphql"."comment_directive"("comment_" "text") TO "postgres";
-- GRANT ALL ON FUNCTION "graphql"."comment_directive"("comment_" "text") TO "anon";
-- GRANT ALL ON FUNCTION "graphql"."comment_directive"("comment_" "text") TO "authenticated";
-- GRANT ALL ON FUNCTION "graphql"."comment_directive"("comment_" "text") TO "service_role";


--
-- Name: FUNCTION "exception"("message" "text"); Type: ACL; Schema: graphql; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "graphql"."exception"("message" "text") TO "postgres";
-- GRANT ALL ON FUNCTION "graphql"."exception"("message" "text") TO "anon";
-- GRANT ALL ON FUNCTION "graphql"."exception"("message" "text") TO "authenticated";
-- GRANT ALL ON FUNCTION "graphql"."exception"("message" "text") TO "service_role";


--
-- Name: FUNCTION "get_schema_version"(); Type: ACL; Schema: graphql; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "graphql"."get_schema_version"() TO "postgres";
-- GRANT ALL ON FUNCTION "graphql"."get_schema_version"() TO "anon";
-- GRANT ALL ON FUNCTION "graphql"."get_schema_version"() TO "authenticated";
-- GRANT ALL ON FUNCTION "graphql"."get_schema_version"() TO "service_role";


--
-- Name: FUNCTION "increment_schema_version"(); Type: ACL; Schema: graphql; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "graphql"."increment_schema_version"() TO "postgres";
-- GRANT ALL ON FUNCTION "graphql"."increment_schema_version"() TO "anon";
-- GRANT ALL ON FUNCTION "graphql"."increment_schema_version"() TO "authenticated";
-- GRANT ALL ON FUNCTION "graphql"."increment_schema_version"() TO "service_role";


--
-- Name: FUNCTION "graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb"); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "postgres";
-- GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "anon";
-- GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "authenticated";
-- GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "service_role";


--
-- Name: FUNCTION "http_collect_response"("request_id" bigint, "async" boolean); Type: ACL; Schema: net; Owner: supabase_admin
--

-- REVOKE ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) FROM PUBLIC;
-- GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "supabase_functions_admin";
-- GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "anon";
-- GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "authenticated";
-- GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "service_role";
-- GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "postgres";


--
-- Name: FUNCTION "http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer); Type: ACL; Schema: net; Owner: supabase_admin
--

-- REVOKE ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) FROM PUBLIC;
-- GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "supabase_functions_admin";
-- GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "anon";
-- GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "authenticated";
-- GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "service_role";
-- GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "postgres";


--
-- Name: FUNCTION "http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer); Type: ACL; Schema: net; Owner: supabase_admin
--

-- REVOKE ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) FROM PUBLIC;
-- GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "supabase_functions_admin";
-- GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "anon";
-- GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "authenticated";
-- GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "service_role";
-- GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "postgres";


--
-- Name: TABLE "valid_key"; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- REVOKE SELECT ON TABLE "pgsodium"."valid_key" FROM "pgsodium_keyiduser";
-- GRANT ALL ON TABLE "pgsodium"."valid_key" TO "pgsodium_keyiduser";


--
-- Name: FUNCTION "crypto_aead_det_decrypt"("message" "bytea", "additional" "bytea", "key_uuid" "uuid", "nonce" "bytea"); Type: ACL; Schema: pgsodium; Owner: pgsodium_keymaker
--

-- GRANT ALL ON FUNCTION "pgsodium"."crypto_aead_det_decrypt"("message" "bytea", "additional" "bytea", "key_uuid" "uuid", "nonce" "bytea") TO "service_role";


--
-- Name: FUNCTION "crypto_aead_det_encrypt"("message" "bytea", "additional" "bytea", "key_uuid" "uuid", "nonce" "bytea"); Type: ACL; Schema: pgsodium; Owner: pgsodium_keymaker
--

-- GRANT ALL ON FUNCTION "pgsodium"."crypto_aead_det_encrypt"("message" "bytea", "additional" "bytea", "key_uuid" "uuid", "nonce" "bytea") TO "service_role";


--
-- Name: FUNCTION "crypto_aead_det_keygen"(); Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION "pgsodium"."crypto_aead_det_keygen"() TO "service_role";


--
-- Name: FUNCTION "add_org_creator"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."add_org_creator"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_org_creator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_org_creator"() TO "service_role";


--
-- Name: FUNCTION "add_task_board_creator"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."add_task_board_creator"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_task_board_creator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_task_board_creator"() TO "service_role";


--
-- Name: FUNCTION "create_profile_for_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "service_role";


--
-- Name: FUNCTION "delete_invite_when_accepted"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."delete_invite_when_accepted"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_invite_when_accepted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_invite_when_accepted"() TO "service_role";


--
-- Name: FUNCTION "get_user_tasks"("_board_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_user_tasks"("_board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tasks"("_board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tasks"("_board_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";


--
-- Name: FUNCTION "gin_extract_value_trgm"("text", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";


--
-- Name: FUNCTION "gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";


--
-- Name: FUNCTION "gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_compress"("internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_consistent"("internal", "text", smallint, "oid", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_decompress"("internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_distance"("internal", "text", smallint, "oid", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_options"("internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_penalty"("internal", "internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_picksplit"("internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";


--
-- Name: FUNCTION "gtrgm_union"("internal", "internal"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";


--
-- Name: FUNCTION "is_list_accessible"("_list_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_list_accessible"("_list_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_list_accessible"("_list_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_list_accessible"("_list_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_member_invited"("_user_id" "uuid", "_org_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_member_invited"("_user_id" "uuid", "_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_invited"("_user_id" "uuid", "_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_invited"("_user_id" "uuid", "_org_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_org_member"("_user_id" "uuid", "_org_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_org_member"("_user_id" "uuid", "_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("_user_id" "uuid", "_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("_user_id" "uuid", "_org_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_task_accessible"("_task_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_task_accessible"("_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_task_accessible"("_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_task_accessible"("_task_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_task_board_member"("_user_id" "uuid", "_board_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_task_board_member"("_user_id" "uuid", "_board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_task_board_member"("_user_id" "uuid", "_board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_task_board_member"("_user_id" "uuid", "_board_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_task_in_board"("_user_id" "uuid", "_task_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "search_users_by_name"("search_query" character varying); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."search_users_by_name"("search_query" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."search_users_by_name"("search_query" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_users_by_name"("search_query" character varying) TO "service_role";


--
-- Name: FUNCTION "set_limit"(real); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";


--
-- Name: FUNCTION "show_limit"(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";


--
-- Name: FUNCTION "show_trgm"("text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";


--
-- Name: FUNCTION "similarity"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";


--
-- Name: FUNCTION "similarity_dist"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";


--
-- Name: FUNCTION "similarity_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "strict_word_similarity"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";


--
-- Name: FUNCTION "strict_word_similarity_commutator_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "strict_word_similarity_dist_commutator_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "strict_word_similarity_dist_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "strict_word_similarity_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "word_similarity"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";


--
-- Name: FUNCTION "word_similarity_commutator_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "word_similarity_dist_commutator_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "word_similarity_dist_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";


--
-- Name: FUNCTION "word_similarity_op"("text", "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


--
-- Name: TABLE "pg_stat_statements"; Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON TABLE "extensions"."pg_stat_statements" TO "dashboard_user";


--
-- Name: TABLE "pg_stat_statements_info"; Type: ACL; Schema: extensions; Owner: supabase_admin
--

-- GRANT ALL ON TABLE "extensions"."pg_stat_statements_info" TO "dashboard_user";


--
-- Name: SEQUENCE "seq_schema_version"; Type: ACL; Schema: graphql; Owner: supabase_admin
--

-- GRANT ALL ON SEQUENCE "graphql"."seq_schema_version" TO "postgres";
-- GRANT ALL ON SEQUENCE "graphql"."seq_schema_version" TO "anon";
-- GRANT ALL ON SEQUENCE "graphql"."seq_schema_version" TO "authenticated";
-- GRANT ALL ON SEQUENCE "graphql"."seq_schema_version" TO "service_role";


--
-- Name: TABLE "_http_response"; Type: ACL; Schema: net; Owner: supabase_admin
--

-- REVOKE ALL ON TABLE "net"."_http_response" FROM "supabase_admin";


--
-- Name: TABLE "http_request_queue"; Type: ACL; Schema: net; Owner: supabase_admin
--

-- REVOKE ALL ON TABLE "net"."http_request_queue" FROM "supabase_admin";


--
-- Name: TABLE "decrypted_key"; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- GRANT ALL ON TABLE "pgsodium"."decrypted_key" TO "pgsodium_keyholder";


--
-- Name: SEQUENCE "key_key_id_seq"; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- GRANT ALL ON SEQUENCE "pgsodium"."key_key_id_seq" TO "pgsodium_keyiduser";


--
-- Name: TABLE "masking_rule"; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- GRANT ALL ON TABLE "pgsodium"."masking_rule" TO "pgsodium_keyholder";


--
-- Name: TABLE "mask_columns"; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

-- GRANT ALL ON TABLE "pgsodium"."mask_columns" TO "pgsodium_keyholder";


--
-- Name: TABLE "org_boards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."org_boards" TO "anon";
GRANT ALL ON TABLE "public"."org_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."org_boards" TO "service_role";


--
-- Name: TABLE "org_invites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."org_invites" TO "anon";
GRANT ALL ON TABLE "public"."org_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."org_invites" TO "service_role";


--
-- Name: TABLE "org_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."org_members" TO "anon";
GRANT ALL ON TABLE "public"."org_members" TO "authenticated";
GRANT ALL ON TABLE "public"."org_members" TO "service_role";


--
-- Name: TABLE "orgs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";


--
-- Name: TABLE "personal_notes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."personal_notes" TO "anon";
GRANT ALL ON TABLE "public"."personal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_notes" TO "service_role";


--
-- Name: TABLE "project_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";


--
-- Name: TABLE "projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";


--
-- Name: TABLE "task_assignees"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";


--
-- Name: TABLE "task_board_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."task_board_members" TO "anon";
GRANT ALL ON TABLE "public"."task_board_members" TO "authenticated";
GRANT ALL ON TABLE "public"."task_board_members" TO "service_role";


--
-- Name: TABLE "task_boards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."task_boards" TO "anon";
GRANT ALL ON TABLE "public"."task_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."task_boards" TO "service_role";


--
-- Name: TABLE "task_lists"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."task_lists" TO "anon";
GRANT ALL ON TABLE "public"."task_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."task_lists" TO "service_role";


--
-- Name: TABLE "tasks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";


--
-- Name: TABLE "team_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";


--
-- Name: TABLE "team_projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."team_projects" TO "anon";
GRANT ALL ON TABLE "public"."team_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."team_projects" TO "service_role";


--
-- Name: TABLE "teams"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


--
-- PostgreSQL database dump complete
--

RESET ALL;
