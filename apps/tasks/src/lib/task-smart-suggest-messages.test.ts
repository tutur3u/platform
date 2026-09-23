import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

const apps = [
  'tasks',
  'calendar',
  'forms',
  'contacts',
  'cms',
  'drive',
  'web',
  'infrastructure',
];
const feedbackKeys = [
  'smart_prompt_required',
  'smart_no_suggestions',
  'smart_suggestions_failed_description',
  'smart_suggestion_applied',
  'smart_create_failed',
  'smart_create_partial_failed',
  'smart_create_selected_success',
] as const;

describe.each(['en', 'vi'])('Smart Suggest feedback in %s', (locale) => {
  it.each(apps)(
    'renders messages from the %s app without missing-key fallbacks',
    (app) => {
      const messages = JSON.parse(
        readFileSync(
          resolve(
            dirname(fileURLToPath(import.meta.url)),
            '../../../',
            app,
            'messages',
            `${locale}.json`
          ),
          'utf8'
        )
      );
      const t = createTranslator({
        locale,
        messages,
        namespace: 'ws-task-boards.dialog',
        onError: (error) => {
          throw error;
        },
      });
      for (const key of feedbackKeys) {
        const message = t(key, { count: 2 });
        expect(message).not.toBe(key);
        expect(message).not.toContain('ws-task-boards.dialog.');
        expect(message.trim().length).toBeGreaterThan(0);
      }
    }
  );
});
