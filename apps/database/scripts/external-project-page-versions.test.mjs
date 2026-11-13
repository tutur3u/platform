// CMS page versions on a synthetic in-memory PGlite schema: the real caller-
// bound helpers, entry policies and page-version migration, then the pgTAP
// suite, then the static rollback and a re-apply. No real database involved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const MIGRATION =
  'supabase/migrations/20261109010100_external_project_page_versions.sql';
const PERMISSION =
  'supabase/migrations/20261109010000_external_project_edit_permission.sql';
const PERMISSION_ROLLBACK =
  'rollbacks/20261109010000_external_project_edit_permission.rollback.sql';
const ROLLBACK =
  'rollbacks/20261109010100_external_project_page_versions.rollback.sql';
