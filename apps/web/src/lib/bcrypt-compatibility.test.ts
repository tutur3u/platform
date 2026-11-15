import native from 'bcrypt';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

describe('link password bcrypt compatibility', () => {
  it('verifies runtime-generated existing-format hashes at cost 10', async () => {
    const password = 'fixture-only password with Tiếng Việt';
    const existing = await native.hash(password, 10);
    expect(existing).toMatch(/^\$2b\$10\$/);
    for (const version of ['2a', '2b', '2y']) {
      const hash = existing.replace('$2b$', `$${version}$`);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare(`${password}!`, hash)).toBe(false);
      expect(bcrypt.getRounds(hash)).toBe(10);
    }
  });

  it('produces byte-identical hashes with the same salt and cost', async () => {
    const salt = await native.genSalt(10);
    for (const password of [
      '',
      'ascii fixture',
      'Tiếng Việt 🔐',
      'a'.repeat(71) + 'é',
    ]) {
      const hash = await bcrypt.hash(password, salt);
      expect(hash).toBe(await native.hash(password, salt));
      expect(await native.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare(password, hash)).toBe(true);
    }
  });

  it('retains the bcrypt 72-byte truncation contract', async () => {
    const prefix = 'a'.repeat(72);
    const hash = await native.hash(`${prefix}first`, 10);
    expect(await bcrypt.compare(`${prefix}second`, hash)).toBe(true);
    expect(await bcrypt.compare(`b${prefix.slice(1)}`, hash)).toBe(false);
  });

  it('round-trips new hashes at the production cost within a generous budget', async () => {
    const started = performance.now();
    const hash = await bcrypt.hash('new fixture password', 10);
    expect(hash).toMatch(/^\$2b\$10\$/);
    expect(await native.compare('new fixture password', hash)).toBe(true);
    expect(await bcrypt.compare('new fixture password', hash)).toBe(true);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it('rejects malformed hashes and wrong passwords', async () => {
    for (const hash of ['', 'not-a-hash', '$2b$10$truncated']) {
      expect(await bcrypt.compare('fixture password', hash)).toBe(false);
    }
  });
});
