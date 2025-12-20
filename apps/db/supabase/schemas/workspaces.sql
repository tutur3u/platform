CREATE TABLE "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false,
    "handle" "text",
    "avatar_url" "text",
    "logo_url" "text",
    "creator_id" "uuid" DEFAULT "auth"."uid"(),
    "personal" boolean DEFAULT false NOT NULL,
    "timezone" "text" DEFAULT 'auto' :: "text",
    "first_day_of_week" "text" DEFAULT 'auto' :: "text",
    CONSTRAINT "workspaces_first_day_of_week_check" CHECK (
        (
            "first_day_of_week" = ANY (
                ARRAY ['auto'::"text", 'sunday'::"text", 'monday'::"text", 'saturday'::"text"]
            )
        )
    )
);