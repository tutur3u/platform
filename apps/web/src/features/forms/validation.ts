import { getReachableQuestionIds } from './branching';
import { normalizeMarkdownToText } from './content';
import type { FormDefinition } from './types';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const DEFAULT_VALIDATION_MESSAGE = 'The current value is not accepted.';

export function getValidationConstraintHint(
  settings: {
    validationMode?: string;
    validationMin?: number;
    validationMax?: number;
  },
  t: (key: string, values?: Record<string, string | number>) => string
): string | null {
  const mode = settings.validationMode ?? 'none';
  if (mode === 'none') return null;

  const min = settings.validationMin;
  const max = settings.validationMax;

  if (mode === 'integer' || mode === 'numeric') {
    if (min != null && max != null) {
      return t('runtime.validation_constraint_integer_range', { min, max });
    }
    if (min != null) {
      return t('runtime.validation_constraint_integer_min', { min });
    }
    if (max != null) {
      return t('runtime.validation_constraint_integer_max', { max });
    }
    return t('runtime.validation_constraint_integer');
  }
  if (mode === 'real') {
    if (min != null && max != null) {
      return t('runtime.validation_constraint_real_range', { min, max });
    }
    if (min != null) {
      return t('runtime.validation_constraint_real_min', { min });
    }
    if (max != null) {
      return t('runtime.validation_constraint_real_max', { max });
    }
    return t('runtime.validation_constraint_real');
  }
  if (mode === 'email') {
    return t('runtime.validation_constraint_email');
  }
  if (mode === 'regex') {
    return t('runtime.validation_constraint_regex');
  }
  return null;
}

export function validateQuestionValue(
  value: unknown,
  settings: {
    validationMode?: string;
    validationMin?: number;
    validationMax?: number;
    validationPattern?: string;
    validationMessage?: string;
  }
): { valid: boolean; message?: string } {
  const mode = settings.validationMode ?? 'none';
  if (mode === 'none') return { valid: true };

  const str = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!str) return { valid: true };

  const msg = settings.validationMessage?.trim() || DEFAULT_VALIDATION_MESSAGE;

  if (mode === 'integer' || mode === 'numeric') {
    const num = Number(str);
    if (!Number.isInteger(num) || Number.isNaN(num)) {
      return { valid: false, message: msg };
    }
    const min = settings.validationMin;
    const max = settings.validationMax;
    if (min != null && num < min) {
      return { valid: false, message: msg };
    }
    if (max != null && num > max) {
      return { valid: false, message: msg };
    }
    return { valid: true };
  }

  if (mode === 'real') {
    const num = Number(str);
    if (Number.isNaN(num)) {
      return { valid: false, message: msg };
    }
    const min = settings.validationMin;
    const max = settings.validationMax;
    if (min != null && num < min) {
      return { valid: false, message: msg };
    }
    if (max != null && num > max) {
      return { valid: false, message: msg };
    }
    return { valid: true };
  }

  if (mode === 'email') {
    return EMAIL_REGEX.test(str)
      ? { valid: true }
      : { valid: false, message: msg };
  }

  if (mode === 'regex' && settings.validationPattern) {
    try {
      const re = new RegExp(settings.validationPattern);
      return re.test(str) ? { valid: true } : { valid: false, message: msg };
    } catch {
      return { valid: true };
    }
  }

  return { valid: true };
}

export function validateSubmittedAnswers(
  form: FormDefinition,
  answers: Record<string, unknown>
) {
  const reachableQuestions = new Set(getReachableQuestionIds(form, answers));
  const missingRequired = form.sections.flatMap((section) =>
    section.questions
      .filter(
        (question) => reachableQuestions.has(question.id) && question.required
      )
      .filter((question) => {
        const value = answers[question.id];
        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return value == null || value === '';
      })
      .map((question) => normalizeMarkdownToText(question.title))
  );

  const validationErrors: string[] = [];
  const validationErrorsByQuestionId: Record<string, string> = {};
  for (const section of form.sections) {
    for (const question of section.questions) {
      if (!reachableQuestions.has(question.id)) continue;
      const value = answers[question.id];
      const { valid, message } = validateQuestionValue(
        value,
        question.settings
      );
      if (!valid && message) {
        const full = `${normalizeMarkdownToText(question.title)}: ${message}`;
        validationErrors.push(full);
        validationErrorsByQuestionId[question.id] = message;
      }
    }
  }

  return {
    valid: missingRequired.length === 0 && validationErrors.length === 0,
    missingRequired,
    validationErrors,
    validationErrorsByQuestionId,
  };
}
