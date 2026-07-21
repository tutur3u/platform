'use client';

import type { FormStudioInput } from '../schema';

export const STUDIO_PAGE_GRADIENT_VARS: Record<
  FormStudioInput['theme']['accentColor'],
  [string, string]
> = {
  'dynamic-blue': ['--dynamic-blue', '--dynamic-cyan'],
  'dynamic-cyan': ['--dynamic-cyan', '--dynamic-blue'],
  'dynamic-gray': ['--dynamic-gray', '--dynamic-gray'],
  'dynamic-green': ['--dynamic-green', '--dynamic-yellow'],
  'dynamic-indigo': ['--dynamic-indigo', '--dynamic-purple'],
  'dynamic-orange': ['--dynamic-orange', '--dynamic-yellow'],
  'dynamic-pink': ['--dynamic-pink', '--dynamic-red'],
  'dynamic-purple': ['--dynamic-purple', '--dynamic-pink'],
  'dynamic-red': ['--dynamic-red', '--dynamic-orange'],
  'dynamic-yellow': ['--dynamic-yellow', '--dynamic-orange'],
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
