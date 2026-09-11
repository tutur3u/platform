import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { RoomImages } from './room-images';

it('stores chunked private images, denies other teams, and deletes all assets', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const storage = {
      sql: {
        exec(query: string, ...args: (string | number)[]) {
          const rows = db.prepare(query).all(...args);
          return { toArray: () => rows, one: () => rows[0] };
        },
      },
      transactionSync: (fn: () => void) => fn(),
    } as unknown as DurableObjectStorage;
    const images = new RoomImages(storage);
    const payload = 'a'.repeat(100_000);
    const id = images.store('team-1', {
      base64: btoa(payload),
      mimeType: 'image/png',
    });
    expect(
      db.prepare('SELECT * FROM image_chunks').all().length
    ).toBeGreaterThan(1);
    expect(() => images.read(id, ['team-2'])).toThrow('not_found');
    const response = images.read(id, ['team-1']);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(payload);
    expect(() =>
      images.store('team-1', { base64: 'AAAA', mimeType: 'image/svg+xml' })
    ).toThrow('image_invalid_output');
    expect(() =>
      images.store('team-1', {
        base64: 'A',
        mimeType: 'image/png',
      })
    ).toThrow('image_invalid_output');
    const abandoned = images.store('team-1', {
      base64: btoa('discard'),
      mimeType: 'image/png',
    });
    images.remove([abandoned]);
    expect(() => images.read(abandoned, ['team-1'])).toThrow('not_found');
    expect(await images.read(id, ['team-1']).text()).toBe(payload);
    images.clear();
    expect(() => images.read(id, ['team-1'])).toThrow('not_found');
  } finally {
    db.close();
  }
});

it('persists failed cleanup across instances and retries it before checking capacity', () => {
  const db = new DatabaseSync(':memory:');
  let failDelete = false;
  const storage = {
    sql: {
      exec(query: string, ...args: (string | number)[]) {
        if (failDelete && query.startsWith('DELETE FROM images WHERE'))
          throw new Error('temporary storage failure');
        const rows = db.prepare(query).all(...args);
        return { toArray: () => rows, one: () => rows[0] };
      },
    },
    transactionSync(fn: () => void) {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as DurableObjectStorage;
  try {
    const images = new RoomImages(storage);
    const id = images.store('team', {
      base64: btoa('discard'),
      mimeType: 'image/png',
    });
    failDelete = true;
    expect(() => images.remove([id])).toThrow('temporary storage failure');
    expect(db.prepare('SELECT id FROM image_cleanup').all()).toHaveLength(1);
    expect(() => images.read(id, ['team'])).toThrow('not_found');
    failDelete = false;
    new RoomImages(storage).canStore();
    expect(db.prepare('SELECT id FROM image_cleanup').all()).toHaveLength(0);
    expect(db.prepare('SELECT id FROM images').all()).toHaveLength(0);
    expect(db.prepare('SELECT id FROM image_chunks').all()).toHaveLength(0);
  } finally {
    db.close();
  }
});
