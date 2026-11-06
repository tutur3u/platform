import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const inserts = fs.readdirSync(migrations).flatMap((filename) => {
  const sql = fs.readFileSync(new URL(filename, migrations), 'utf8');
  return [...sql.matchAll(/\binsert\s+into\s+storage\.buckets\b[^;]*;/giu)].map(
    ([statement]) => ({ filename, statement })
  );
});

const defaults = [
  {
    id: 'avatars',
    name: 'avatars',
    public: true,
    file_size_limit: 2097152,
    allowed_mime_types: ['image/*'],
    avif_autodetection: true,
  },
  {
    id: 'support_inquiries',
    name: 'support_inquiries',
    public: false,
    file_size_limit: 1048576,
    allowed_mime_types: ['image/*'],
    avif_autodetection: false,
  },
  {
    id: 'time_tracking_requests',
    name: 'time_tracking_requests',
    public: false,
    file_size_limit: 1048576,
    allowed_mime_types: ['image/*'],
    avif_autodetection: false,
  },
];

test('bucket creation replays while preserving existing bucket settings', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
        file_size_limit bigint, allowed_mime_types text[],
        avif_autodetection boolean DEFAULT false
      );
    `);
    assert.ok(inserts.length > 0, 'migration bucket inserts must be exercised');

    for (const { filename, statement } of inserts) {
      await db.exec('TRUNCATE storage.buckets');
      await db.exec(statement);
      const { rows: fresh } = await db.query('SELECT * FROM storage.buckets');
      assert.ok(fresh.length > 0, `${filename} creates its buckets`);
      await db.exec(statement);
      assert.deepEqual(
        (await db.query('SELECT * FROM storage.buckets')).rows,
        fresh,
        `${filename} replays without duplicates or changed defaults`
      );

      for (const expected of defaults) {
        if (!fresh.some((row) => row.id === expected.id)) continue;
        assert.deepEqual(
          fresh,
          [expected],
          `${filename} retains fresh defaults`
        );
        await db.query(
          `UPDATE storage.buckets SET public = NOT public,
            file_size_limit = 123, allowed_mime_types = ARRAY['image/webp'],
            avif_autodetection = NOT avif_autodetection WHERE id = $1`,
          [expected.id]
        );
        const { rows: configured } = await db.query(
          'SELECT * FROM storage.buckets'
        );
        await db.exec(statement);
        assert.deepEqual(
          (await db.query('SELECT * FROM storage.buckets')).rows,
          configured,
          `${filename} preserves existing bucket configuration`
        );
      }
    }
  } finally {
    await db.close();
  }
});
