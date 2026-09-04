import { createDefaultFormStudioInput } from '../schema';
import type { FormDefinition, FormDefinitionSection } from '../types';

/**
 * Shared `FormDefinition` factory for tests.
 *
 * Every suite that needs a form used to inline the whole literal — theme,
 * typography, settings, the lot — which meant adding one field to the type
 * broke six files at once and each fixture drifted from the real defaults.
 * Building from `createDefaultFormStudioInput()` keeps them honest: a new field
 * with a default is picked up here automatically.
 */
export function createTestFormDefinition(
  overrides: Partial<FormDefinition> = {}
): FormDefinition {
  const defaults = createDefaultFormStudioInput();
  const timestamp = new Date(0).toISOString();

  return {
    id: '50000000-0000-0000-0000-000000000001',
    wsId: '50000000-0000-0000-0000-000000000002',
    creatorId: '50000000-0000-0000-0000-000000000003',
    title: 'Test form',
    description: '',
    status: 'published',
    accessMode: 'anonymous',
    openAt: null,
    closeAt: null,
    maxResponses: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    shareCode: null,
    theme: defaults.theme,
    // Turnstile is on by default in production but would need a live widget in
    // a test, so fixtures opt out unless a suite asks for it.
    settings: { ...defaults.settings, requireTurnstile: false },
    seo: defaults.seo,
    sections: [],
    logicRules: [],
    ...overrides,
  };
}

/** Convenience for the common "one section of N questions" shape. */
export function createTestFormSection(
  overrides: Partial<FormDefinitionSection> & { id: string }
): FormDefinitionSection {
  return {
    title: '',
    description: '',
    image: { storagePath: '', url: '', alt: '' },
    questions: [],
    ...overrides,
  };
}
