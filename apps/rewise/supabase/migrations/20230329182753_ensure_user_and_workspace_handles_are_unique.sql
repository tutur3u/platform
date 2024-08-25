CREATE UNIQUE INDEX users_handle_key ON public.users USING btree (handle);

CREATE UNIQUE INDEX workspaces_handle_key1 ON public.workspaces USING btree (handle);

alter table "public"."users" add constraint "users_handle_key" UNIQUE using index "users_handle_key";

alter table "public"."workspaces" add constraint "workspaces_handle_key1" UNIQUE using index "workspaces_handle_key1";


