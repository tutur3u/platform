CREATE INDEX crawled_url_next_urls_url_idx ON public.crawled_url_next_urls USING btree (url);

CREATE INDEX crawled_urls_created_at_idx ON public.crawled_urls USING btree (created_at);

CREATE INDEX crawled_urls_url_idx ON public.crawled_urls USING btree (url);

CREATE INDEX workspace_users_full_name_idx ON public.workspace_users USING btree (full_name);


