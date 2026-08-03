import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace layout request boundary', () => {
  it('enters request-time rendering before reading authenticated state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/layout.tsx'),
      'utf8'
    );
    const connectionCall = source.indexOf('await connection();');
    const sessionRead = source.indexOf('requireChatUser()');
    const cookieRead = source.indexOf('cookies()');
    const headerRead = source.indexOf('headers()');

    expect(connectionCall).toBeGreaterThan(-1);
    expect(connectionCall).toBeLessThan(sessionRead);
    expect(connectionCall).toBeLessThan(cookieRead);
    expect(connectionCall).toBeLessThan(headerRead);
  });
});
