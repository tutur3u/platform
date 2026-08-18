import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
  getPublicClientMessages,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  PUBLIC_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_PATHS,
  UI_CLIENT_MESSAGE_NAMESPACES,
} from './client-messages';

describe('getPublicClientMessages', () => {
  it('keeps only explicitly client-visible root paths', () => {
    const messages = {
      common: { about: 'About', save: 'Save' },
      'marketing-nav': { products: 'Products' },
      'ws-users': { title: 'Users' },
    };

    expect(getPublicClientMessages(messages)).toEqual({
      common: { about: 'About' },
      'marketing-nav': { products: 'Products' },
    });
  });

  it('keeps the allowlist unique and available in every locale', () => {
    expect(new Set(PUBLIC_CLIENT_MESSAGE_NAMESPACES).size).toBe(
      PUBLIC_CLIENT_MESSAGE_NAMESPACES.length
    );

    const namespaces = new Set([
      ...PUBLIC_CLIENT_MESSAGE_NAMESPACES,
      ...AUTH_CLIENT_MESSAGE_NAMESPACES,
      ...UI_CLIENT_MESSAGE_NAMESPACES,
    ]);

    for (const namespace of namespaces) {
      expect(en).toHaveProperty(namespace);
      expect(vi).toHaveProperty(namespace);
    }
  });

  it('keeps route-group catalogs isolated', () => {
    const auth = getClientMessages(en, AUTH_CLIENT_MESSAGE_NAMESPACES);
    const marketing = getClientMessages(en, [
      ...ROOT_CLIENT_MESSAGE_NAMESPACES,
      ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
    ]);
    const ui = getClientMessages(en, UI_CLIENT_MESSAGE_NAMESPACES);

    expect(auth).toHaveProperty('login');
    expect(auth).not.toHaveProperty('landing');
    expect(marketing).toHaveProperty('landing');
    expect(marketing).not.toHaveProperty('login');
    expect(ui).toHaveProperty('ui-showcase');
    expect(ui).not.toHaveProperty('onboarding');
  });

  it('deep-picks only requested shell keys', () => {
    const messages = {
      common: { about: 'About', hidden: 'Do not serialize' },
      'marketing-nav': { all_apps: 'All apps' },
      landing: { title: 'Tuturuuu' },
    };

    expect(
      getClientMessages(messages, ['common.about', 'marketing-nav'])
    ).toEqual({
      common: { about: 'About' },
      'marketing-nav': { all_apps: 'All apps' },
    });
  });

  it('keeps every root shell path available in every locale', () => {
    for (const path of ROOT_CLIENT_MESSAGE_PATHS) {
      expect(getClientMessages(en, [path])).not.toEqual({});
      expect(getClientMessages(vi, [path])).not.toEqual({});
    }
  });

  it('covers every literal common key used by the public shell', () => {
    const sources = [
      join('src/app/[locale]/marketing-nav/marketing-nav-menu.tsx'),
      join('src/app/[locale]/mobile-menu.tsx'),
      join('src/app/[locale]/public-navbar-actions.tsx'),
      join('../../packages/ui/src/components/ui/custom/common-footer.tsx'),
    ];
    const commonKeyPattern = /\bt\(['"](common\.[^'"]+)['"]/g;

    for (const source of sources) {
      const contents = readFileSync(source, 'utf8');
      for (const match of contents.matchAll(commonKeyPattern)) {
        expect(ROOT_CLIENT_MESSAGE_PATHS).toContain(match[1]);
      }
    }
  });

  it('keeps public serialization below one third of the full catalog', () => {
    for (const messages of [en, vi]) {
      const fullBytes = JSON.stringify(messages).length;
      const publicBytes = JSON.stringify(
        getPublicClientMessages(messages)
      ).length;

      expect(publicBytes / fullBytes).toBeLessThan(1 / 3);
    }
  });
});
