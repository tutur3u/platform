ALTER TABLE workspace_configs DROP CONSTRAINT workspace_configs_pkey;
ALTER TABLE workspace_configs ADD CONSTRAINT workspace_configs_pkey PRIMARY KEY (ws_id, id);
