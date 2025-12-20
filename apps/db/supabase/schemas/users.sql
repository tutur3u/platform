CREATE TABLE "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text",
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "handle" "text",
    "bio" "text",
    "services" "public"."platform_service" [] DEFAULT '{TUTURUUU}' :: "public"."platform_service" [] NOT NULL,
    "timezone" "text" DEFAULT 'auto' :: "text",
    "first_day_of_week" "text" DEFAULT 'auto' :: "text",
    "task_auto_assign_to_self" boolean DEFAULT false,
    "time_format" "text" DEFAULT 'auto' :: "text",
    CONSTRAINT "users_first_day_of_week_check" CHECK (
        (
            "first_day_of_week" = ANY (
                ARRAY ['auto'::"text", 'sunday'::"text", 'monday'::"text", 'saturday'::"text"]
            )
        )
    ),
    CONSTRAINT "users_time_format_check" CHECK (
        (
            "time_format" = ANY (
                ARRAY ['auto'::"text", '12h'::"text", '24h'::"text"]
            )
        )
    )
);