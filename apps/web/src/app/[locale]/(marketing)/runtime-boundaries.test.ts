import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('marketing request-time boundaries', () => {
  it.each([
    ['models/page.tsx', 'ModelsRuntime'],
    ['users/[handle]/page.tsx', 'UserProfileRuntime'],
  ])('streams %s runtime data inside page-level Suspense', (path, runtime) => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/(marketing)', path),
      'utf8'
    );

    expect(source).toMatch(
      new RegExp(
        `export async function ${runtime}\\([\\s\\S]*await connection\\(\\)`
      )
    );
    expect(source).toMatch(
      new RegExp(`<Suspense[\\s\\S]*<${runtime}[\\s\\S]*</Suspense>`)
    );
  });
});
