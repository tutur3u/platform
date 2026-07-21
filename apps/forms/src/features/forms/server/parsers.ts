import crypto from 'node:crypto';
import {
  createDefaultFormStudioInput,
  formQuestionSettingsSchema,
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

export function parseQuestionSettings(settings: FormQuestionRow['settings']) {
  const result = formQuestionSettingsSchema.safeParse(
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings
      : {}
  );

  return result.success ? result.data : {};
}
