import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TASK_RECURRENCE_OPTIONS } from './task-recurrence-picker';

// Every app bundle that ships the quick-create dialog ships Repeat.
const APPS = [
  'calendar',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'infrastructure',
  'rewise',
  'tasks',
  'track',
  'web',
  'workspace',
];

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
const REQUIRED = [
  ...TASK_RECURRENCE_OPTIONS,
  ...FREQUENCIES.flatMap((f) => [`every_${f}`, `unit_${f}`, `frequency_${f}`]),
  ...['never', 'count', 'until'].map((type) => `ends_option_${type}`),
  'scope_only_this',
  'scope_following',
  'start_skipped',
  'date_skipped',
  'until_range',
  'invalid',
];

function recurrence(app: string, locale: 'en' | 'vi') {
  const path = resolve(
    __dirname,
    `../../../../../../apps/${app}/messages/${locale}.json`
  );
  const messages = JSON.parse(readFileSync(path, 'utf8'));
  return messages['ws-task-boards']?.recurrence as Record<string, string>;
}

describe('Repeat messages', () => {
  it.each(APPS)('%s ships matching EN and VI strings', (app) => {
    const en = recurrence(app, 'en');
    const vi = recurrence(app, 'vi');
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const key of REQUIRED) expect(en[key], key).toBeTruthy();
    expect(vi.repeat).not.toBe(en.repeat);
  });
});
