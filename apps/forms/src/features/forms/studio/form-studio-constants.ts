'use client';

import type { FormStudioInput } from '../schema';

export const STUDIO_PAGE_GRADIENT_VARS: Record<
  FormStudioInput['theme']['accentColor'],
  [string, string]
> = {
  'dynamic-blue': ['--blue', '--cyan'],
  'dynamic-cyan': ['--cyan', '--blue'],
  'dynamic-gray': ['--gray', '--gray'],
  'dynamic-green': ['--green', '--yellow'],
  'dynamic-indigo': ['--indigo', '--purple'],
  'dynamic-orange': ['--orange', '--yellow'],
  'dynamic-pink': ['--pink', '--red'],
  'dynamic-purple': ['--purple', '--pink'],
  'dynamic-red': ['--red', '--orange'],
  'dynamic-yellow': ['--yellow', '--orange'],
};

export function isErrorRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function findFirstValidationError(
  value: unknown,
  path: string[] = []
): { path: string[]; message?: string } | null {
  if (!isErrorRecord(value)) {
    return null;
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return { path, message: value.message };
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'ref' || key === 'types') {
      continue;
    }

    const nestedError = findFirstValidationError(nestedValue, [...path, key]);
    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}
