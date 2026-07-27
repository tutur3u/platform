-- Immutable legal publication metadata and explicit acceptance records.
-- Canonical legal copy lives in @tuturuuu/legal; this registry preserves the
-- version/content identity used when a user or enterprise accepts a document.

CREATE TABLE private.legal_document_versions (
  kind TEXT NOT NULL
    CHECK (kind IN ('privacy', 'terms', 'dpa', 'sla', 'subprocessors')),
  version TEXT NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 80),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi')),
  content_hash TEXT NOT NULL CHECK (length(btrim(content_hash)) >= 32),
  published_at TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, version, locale),
  CHECK (superseded_at IS NULL OR superseded_at >= published_at)
);

CREATE TABLE private.legal_document_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  ws_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  locale TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'signup'
    CHECK (source IN ('signup', 'in_app', 'enterprise_order', 'api')),
  enterprise_order_reference TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT legal_acceptance_document_fk
    FOREIGN KEY (kind, version, locale)
    REFERENCES private.legal_document_versions(kind, version, locale)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX legal_acceptances_user_document_idx
  ON private.legal_document_acceptances (user_id, kind, version, locale)
  WHERE ws_id IS NULL;

CREATE UNIQUE INDEX legal_acceptances_workspace_document_idx
  ON private.legal_document_acceptances (user_id, ws_id, kind, version, locale)
  WHERE ws_id IS NOT NULL;

CREATE INDEX legal_acceptances_workspace_time_idx
  ON private.legal_document_acceptances (ws_id, accepted_at DESC)
  WHERE ws_id IS NOT NULL;

CREATE INDEX legal_acceptances_user_time_idx
  ON private.legal_document_acceptances (user_id, accepted_at DESC);

ALTER TABLE private.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.legal_document_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.legal_document_versions,
  private.legal_document_acceptances
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  private.legal_document_versions,
  private.legal_document_acceptances
TO service_role;

COMMENT ON TABLE private.legal_document_versions IS
  'Immutable publication identity for canonical bilingual legal documents.';
COMMENT ON TABLE private.legal_document_acceptances IS
  'Server-recorded acceptance evidence. Network identifiers are stored only as one-way hashes.';
