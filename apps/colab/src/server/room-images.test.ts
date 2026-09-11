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
    images.clear();
    expect(() => images.read(id, ['team-1'])).toThrow('not_found');
  } finally {
    db.close();
  }
});
