CREATE TABLE private.pending_invitation_seat_revocations (
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seat_id text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, user_id, seat_id)
);

REVOKE ALL ON TABLE private.pending_invitation_seat_revocations
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE private.pending_invitation_seat_revocations
TO service_role;
