import crypto from 'node:crypto';
import {
  createDefaultFormStudioInput,
  formQuestionSettingsSchema,
  formSeoSchema,
  formSettingsSchema,
  formThemeSchema,
} from '../schema';
import type { FormQuestionRow, FormRow } from '../types';

export function generateFormShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';

  for (let index = 0; index < 12; index += 1) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }

  return code;
}

export function createClientUuid(): string {
  return crypto.randomUUID();
}

export function parseFormTheme(theme: FormRow['theme']) {
  const result = formThemeSchema.safeParse({
    ...createDefaultFormStudioInput().theme,
    ...(theme && typeof theme === 'object' ? theme : {}),
  });

  return result.success ? result.data : createDefaultFormStudioInput().theme;
}

export function parseFormSettings(settings: FormRow['settings']) {
  const result = formSettingsSchema.safeParse({
    ...createDefaultFormStudioInput().settings,
    ...(settings && typeof settings === 'object' ? settings : {}),
  });

  return result.success ? result.data : createDefaultFormStudioInput().settings;
}

/**
 * Rows written before the `seo` column existed default to `{}`, and every key
 * inside it is optional, so an empty object parses cleanly into "derive
 * everything from the form content".
 */
export function parseFormSeo(seo: FormRow['seo']) {
  const result = formSeoSchema.safeParse(
    seo && typeof seo === 'object' && !Array.isArray(seo) ? seo : {}
  );

  return result.success ? result.data : createDefaultFormStudioInput().seo;
}

export function parseQuestionSettings(settings: FormQuestionRow['settings']) {
  const result = formQuestionSettingsSchema.safeParse(
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings
      : {}
  );

  return result.success ? result.data : {};
}
