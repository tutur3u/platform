import { describe, expect, it } from 'vitest';
import { MAIL_FOLDERS } from '../app/[locale]/(dashboard)/[wsId]/mail-folders';
import { resolveMailPage } from './page-policy';

describe('all 14 original Mail page entries', () => {
  for (const prefix of ['', '/en', '/vi']) {
    const locale = prefix === '/vi' ? 'vi' : 'en';
    it(`maps public and workspace pages for ${prefix || 'default'}`, () => {
      expect(resolveMailPage(`${prefix}/`)).toEqual({ kind: 'home', locale });
      for (const kind of ['login', 'verify-token', 'not-available'])
        expect(resolveMailPage(`${prefix}/${kind}`)).toEqual({ kind, locale });
      expect(resolveMailPage(`${prefix}/personal`)).toEqual({
        kind: 'workspace-index',
        locale,
        wsId: 'personal',
      });
      for (const folder of MAIL_FOLDERS)
        expect(resolveMailPage(`${prefix}/tenant/${folder}`)).toEqual({
          kind: 'folder',
          locale,
          wsId: 'tenant',
          folder,
        });
      expect(resolveMailPage(`${prefix}/tenant/not-a-folder`).kind).toBe(
        'missing'
      );
      expect(resolveMailPage(`${prefix}/tenant/inbox/extra`).kind).toBe(
        'missing'
      );
    });
  }
  it('decodes workspace ids and rejects malformed input', () => {
    expect(resolveMailPage('/a%20b/inbox')).toMatchObject({ wsId: 'a b' });
    expect(() => resolveMailPage('/%ZZ/inbox')).toThrow(URIError);
  });
});
