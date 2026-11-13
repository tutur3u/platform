#!/usr/bin/env node
// Real-stack contract for CMS page versions: apply the complete tracked
// schema to a disposable Supabase stack, then run the pgTAP suite that the
// PGlite harness (external-project-page-versions.test.mjs) also runs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPagePublishConcurrency } from './external-project-page-versions-concurrency.mjs';
import { assertStrictTap } from './programming-database-tap.mjs';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

export const pageVersionsFixture = 'external-project-page-versions.sql';
export const pageVersionsMigrations = [
  'apps/database/supabase/migrations/20261109010000_external_project_edit_permission.sql',
  'apps/database/supabase/migrations/20261109010100_external_project_page_versions.sql',
