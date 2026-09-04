import { getReachableQuestionIds } from './branching';
import { normalizeMarkdownToText } from './content';
import type { FormDefinition } from './types';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Deliberately permissive: only the characters people actually type in a phone
 * number, then a digit-count range wide enough for every national format.
 * Anything stricter rejects real numbers, and this field is not the place to
 * litigate dialling plans.
 */
const PHONE_ALLOWED_CHARACTERS = /^[+()\-.\s\d]+$/;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 20;

const DEFAULT_VALIDATION_MESSAGE = 'The current value is not accepted.';

/**
 * The validation a question type enforces on its own, before any author-chosen
 * `validationMode`. A `url` question is a url whether or not the author opened
 * the validation panel.
 */
const INTRINSIC_VALIDATION_MODE_BY_TYPE: Record<string, string> = {
  email: 'email',
  url: 'url',
  phone: 'phone',
  number: 'real',
};

export function getIntrinsicValidationMode(
  type: string | undefined
): string | null {
  if (!type) return null;
  return INTRINSIC_VALIDATION_MODE_BY_TYPE[type] ?? null;
}

function isValidUrl(value: string) {
  // `URL` accepts any scheme, including `javascript:` and bare `mailto:`.
  // A url question means a link someone can follow, so restrict to http(s)
  // and require a host.
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

function isValidPhone(value: string) {
  if (!PHONE_ALLOWED_CHARACTERS.test(value)) return false;
  const digitCount = value.replace(/\D/g, '').length;
  return digitCount >= PHONE_MIN_DIGITS && digitCount <= PHONE_MAX_DIGITS;
}

/**
 * Floating-point modulo lies: `0.3 % 0.1` is 0.0999..., not 0. Compare against
 * both ends of the step so a value that lands exactly on one is not rejected
 * for being 1e-16 away from it.
 */
function isMultipleOfStep(value: number, step: number) {
  const remainder = Math.abs(value % step);
  const epsilon = Math.max(Math.abs(value), step) * 1e-9;
  return remainder <= epsilon || Math.abs(remainder - step) <= epsilon;
}

export function getValidationConstraintHint(
  settings: {
    validationMode?: string | null;
    validationMin?: number | null;
    validationMax?: number | null;
    numberStep?: number | null;
  },
  t: (key: string, values?: Record<string, string | number>) => string,
  type?: string
): string | null {
  const intrinsicMode = getIntrinsicValidationMode(type);
  const authorMode = settings.validationMode ?? 'none';
  const mode =
    intrinsicMode && authorMode === 'none' ? intrinsicMode : authorMode;

  // The input type already signals email/phone/url to the respondent — the
  // keyboard changes, and the browser labels the field. Repeating it as a hint
  // is noise, so only the range constraints on a number are worth a line.
  if (mode === 'email' || mode === 'url' || mode === 'phone') return null;
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
    const step = settings.numberStep;
    if (step != null && step > 0) {
      if (min != null && max != null) {
        return t('runtime.validation_constraint_step_range', {
          min,
          max,
          step,
        });
      }
      return t('runtime.validation_constraint_step', { step });
    }
    if (min != null && max != null) {
      return t('runtime.validation_constraint_real_range', { min, max });
    }
    if (min != null) {
      return t('runtime.validation_constraint_real_min', { min });
    }
    if (max != null) {
      return t('runtime.validation_constraint_real_max', { max });
    }
    // A plain `number` question with no bounds needs no hint: the numeric
    // keyboard already says it.
    return type === 'number' ? null : t('runtime.validation_constraint_real');
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
    validationMode?: string | null;
    validationMin?: number | null;
    validationMax?: number | null;
    validationPattern?: string | null;
    validationMessage?: string | null;
    numberStep?: number | null;
  },
  type?: string
): { valid: boolean; message?: string } {
  const intrinsicMode = getIntrinsicValidationMode(type);
  const authorMode = settings.validationMode ?? 'none';

  // An author-chosen mode layers on top of the type's own check rather than
  // replacing it: a `number` question with a regex still has to be a number.
  const mode =
    intrinsicMode && authorMode === 'none' ? intrinsicMode : authorMode;

  if (mode === 'none' && !intrinsicMode) return { valid: true };

  const str = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!str) return { valid: true };

  const msg = settings.validationMessage?.trim() || DEFAULT_VALIDATION_MESSAGE;

  if (intrinsicMode && intrinsicMode !== mode) {
    const intrinsic = validateAgainstMode(str, intrinsicMode, settings, msg);
    if (!intrinsic.valid) return intrinsic;
  }

  return validateAgainstMode(str, mode, settings, msg);
}

function validateAgainstMode(
  str: string,
  mode: string,
  settings: {
    validationMin?: number | null;
    validationMax?: number | null;
    validationPattern?: string | null;
    numberStep?: number | null;
  },
  msg: string
): { valid: boolean; message?: string } {
  if (mode === 'none') return { valid: true };

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
    const step = settings.numberStep;
    if (step != null && step > 0 && !isMultipleOfStep(num - (min ?? 0), step)) {
      return { valid: false, message: msg };
    }
    return { valid: true };
  }

  if (mode === 'email') {
    return EMAIL_REGEX.test(str)
      ? { valid: true }
      : { valid: false, message: msg };
  }

  // `url` was already an offered validation mode but had no branch here, so
  // picking it silently accepted everything.
  if (mode === 'url') {
    return isValidUrl(str) ? { valid: true } : { valid: false, message: msg };
  }

  if (mode === 'phone') {
    return isValidPhone(str) ? { valid: true } : { valid: false, message: msg };
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
        question.settings,
        question.type
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
