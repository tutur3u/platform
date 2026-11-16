import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMAND_LAUNCHER_MESSAGE_KEYS } from './command-launcher-labels';

const APPS_DIR = resolve(__dirname, '../../../../../apps');

/**
 * Every app that mounts the shared command center with localized labels.
 * `external` and `playground` are English-only apps without message
 * catalogs (see apps/playground/src/i18n/request.ts) and use the defaults.
 */
const LOCALIZED_HOSTS = [
  'ai',
  'apps',
  'calendar',
  'chat',
  'cms',
  'colab',
  'contacts',
  'drive',
  'finance',
  'forms',
  'git',
  'hive',
  'infrastructure',
  'inventory',
  'learn',
  'lettin',
  'mail',
  'meet',
  'mind',
  'nova',
  'parley',
  'pay',
  'rewise',
  'shortener',
  'storefront',
  'tasks',
  'teach',
  'tools',
  'track',
  'web',
  'workspace',
] as const;

/** Hosts that keep their `command_palette` copy for scopes and placeholder. */
const PALETTE_HOSTS = ['finance', 'tasks', 'web', 'workspace'] as const;
const PALETTE_KEYS = [
  'loading_workspaces',
  'no_results',
  'search_placeholder_power',
  'tabs.actions',
  'tabs.all',
  'tabs.apps',
  'tabs.label',
  'tabs.navigate',
  'tabs.tasks',
  'title',
  'try_searching',
];

function read(app: string, locale: 'en' | 'vi') {
  const path = resolve(APPS_DIR, app, 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function lookup(root: unknown, dotted: string) {
  let value = root;
  for (const part of dotted.split('.')) {
    value =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }
  return value;
}

function missingKeys(namespace: unknown, keys: readonly string[]) {
  return keys.filter((key) => {
    const value = lookup(namespace, key);
    return typeof value !== 'string' || value.trim() === '';
  });
}

describe('command launcher message coverage', () => {
  it('lists only apps that ship message catalogs', () => {
    for (const app of LOCALIZED_HOSTS) {
      expect(existsSync(resolve(APPS_DIR, app, 'messages', 'vi.json'))).toBe(
        true
      );
    }
  });

  for (const app of LOCALIZED_HOSTS) {
    for (const locale of ['en', 'vi'] as const) {
      it(`${app} ${locale} has every command_launcher label`, () => {
        const namespace = read(app, locale).command_launcher;
        expect(
          missingKeys(namespace, Object.values(COMMAND_LAUNCHER_MESSAGE_KEYS))
        ).toEqual([]);
      });
    }
  }

  for (const app of PALETTE_HOSTS) {
    for (const locale of ['en', 'vi'] as const) {
      it(`${app} ${locale} has the command_palette overrides`, () => {
        expect(
          missingKeys(read(app, locale).command_palette, PALETTE_KEYS)
        ).toEqual([]);
      });
    }
  }

  it('translates the new labels for Vietnamese instead of copying English', () => {
    const en = read('web', 'en').command_launcher;
    const vi = read('web', 'vi').command_launcher;
    for (const key of ['ask_mira_description', 'create_task', 'recent']) {
      expect(lookup(vi, key)).not.toBe(lookup(en, key));
    }
  });
});
