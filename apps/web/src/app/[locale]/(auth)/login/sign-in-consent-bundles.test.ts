import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sign-in and sign-up agree to the Terms and Privacy Policy only; product
// email is a separate onboarding opt-in, off by default
// (apps/docs/platform/privacy/data-protection-standard.mdx). Every app
// bundle that ships the shared notice must say so in English and Vietnamese.
const APPS_DIR = resolve(process.cwd(), '..');
const EMAIL_CONSENT =
  /periodic e-?mails?|e-?mails? with (new )?updates|email định kỳ|nhận email/iu;

type Bundle = Record<string, Record<string, unknown> | undefined>;

function bundles() {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      (['en', 'vi'] as const).flatMap((locale) => {
        const path = join(APPS_DIR, entry.name, 'messages', `${locale}.json`);
        try {
          const bundle = JSON.parse(readFileSync(path, 'utf8')) as Bundle;
          return [{ app: entry.name, bundle, locale }];
        } catch {
          return [];
        }
      })
    );
}

describe('sign-in consent copy across app bundles', () => {
  const shipped = bundles().filter(({ bundle }) =>
    ['auth', 'signup'].some((ns) => bundle[ns]?.['notice-p2'] !== undefined)
  );

  it('finds the shared notice in the web and workspace bundles', () => {
    const apps = new Set(shipped.map(({ app }) => app));
    expect(apps.has('web')).toBe(true);
    expect(apps.has('workspace')).toBe(true);
  });

  it.each(shipped.map(({ app, bundle, locale }) => [app, locale, bundle]))(
    '%s %s notice names the Terms and Privacy Policy only',
    (_app, _locale, bundle) => {
      for (const ns of ['auth', 'signup']) {
        const notice = bundle[ns];
        if (notice?.['notice-p2'] === undefined) continue;
        const copy = `${notice['notice-p1']} ${notice.tos} ${notice.privacy} ${notice['notice-p2']}`;
        expect(copy).not.toMatch(EMAIL_CONSENT);
        expect(typeof notice.tos).toBe('string');
        expect(typeof notice.privacy).toBe('string');
      }
    }
  );
});
