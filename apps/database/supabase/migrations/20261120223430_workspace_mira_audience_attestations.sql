-- Workspace 18+ audience attestation for Meet Mira (Private Mira and room Mira).
--
-- Additive and independent: one new private table, no change to existing
-- objects, so it can ship in any production migration batch. A row means a
-- workspace settings manager attested that the workspace's Meet audience is
-- adults only. Deleting the row withdraws the attestation; Mira then denies new
-- non-staff sessions in that workspace's meetings.
--
-- Service role only. The apps/web settings route checks
-- manage_workspace_settings and records the authenticated actor and server
-- time; the Meet Worker reads it server-side. Clients have no access.

CREATE TABLE private.workspace_mira_audience_attestations (
  ws_id uuid PRIMARY KEY
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'adults-only'
    CHECK (audience = 'adults-only'),
  -- Nulled when the attesting account is erased, which invalidates the
  -- attestation until a current manager attests again.
  attested_by uuid
    REFERENCES public.users(id) ON DELETE SET NULL,
  attested_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.workspace_mira_audience_attestations IS
  'Meet Mira 18+ audience attestation per workspace. Service-role access only.';

ALTER TABLE private.workspace_mira_audience_attestations
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.workspace_mira_audience_attestations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE private.workspace_mira_audience_attestations TO service_role;
