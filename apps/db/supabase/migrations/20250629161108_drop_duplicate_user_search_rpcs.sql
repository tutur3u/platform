drop function if exists "public"."count_search_users"(search_query text);

drop function if exists "public"."search_users"(search_query text, page_number integer, page_size integer);