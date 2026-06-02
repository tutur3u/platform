import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260602193152_harden_topic_announcement_queue_cron.sql'
);

describe('topic announcement queue cron migration', () => {
  it('adds a processing state for atomic scheduled-send claims', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain('drop constraint if exists');
    expect(source).toContain('topic_announcements_status_check');
    expect(source).toContain("'processing'");
    expect(source).toContain('topic_announcements_processing_updated_idx');
    expect(source).toContain("where status = 'processing'");
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
