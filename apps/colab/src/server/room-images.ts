import { requireRule } from '@tuturuuu/multiplayer';

const MAX_BASE64 = 8_000_000;
const CHUNK = 64_000;

/** Private room assets live outside the realtime JSON state. */
export class RoomImages {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, team TEXT NOT NULL, mime TEXT NOT NULL)'
    );
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS image_chunks (id TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(id, part))'
    );
  }
  canStore() {
    requireRule(
      this.storage.sql
        .exec<{ count: number }>('SELECT COUNT(*) AS count FROM images')
        .one().count < 50,
      'image_limit'
    );
  }
  store(team: string, image: { base64: string; mimeType: string }) {
    this.canStore();
    requireRule(
      ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType),
      'image_invalid_output'
    );
    requireRule(
      image.base64.length > 0 &&
        image.base64.length <= MAX_BASE64 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(image.base64),
      'image_invalid_output'
    );
    const id = crypto.randomUUID();
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        'INSERT INTO images VALUES (?, ?, ?)',
        id,
        team,
        image.mimeType
      );
      for (let start = 0; start < image.base64.length; start += CHUNK)
        this.storage.sql.exec(
          'INSERT INTO image_chunks VALUES (?, ?, ?)',
          id,
          start / CHUNK,
          image.base64.slice(start, start + CHUNK)
        );
    });
    return id;
  }
  read(id: string, visibleTeams: string[]) {
    const entry = this.storage.sql
      .exec<{ team: string; mime: string }>(
        'SELECT team, mime FROM images WHERE id = ?',
        id
      )
      .toArray()[0];
    requireRule(entry && visibleTeams.includes(entry.team), 'not_found', 404);
    const encoded = this.storage.sql
      .exec<{ value: string }>(
        'SELECT value FROM image_chunks WHERE id = ? ORDER BY part',
        id
      )
      .toArray()
      .map((row) => row.value)
      .join('');
    return new Response(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
      {
        headers: {
          'Content-Type': entry.mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  }
  clear() {
    this.storage.sql.exec('DELETE FROM image_chunks');
    this.storage.sql.exec('DELETE FROM images');
  }
}
