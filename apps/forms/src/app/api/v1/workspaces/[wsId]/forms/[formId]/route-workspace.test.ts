// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { FormNotFoundError } from '@/features/forms/server/errors';
import { PUT } from './route';

const state = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/features/forms/route-utils', () => ({
  parseFormIdParam: (value: string) => value,
  getWorkspaceRouteContext: async () => ({
    user: { id: 'actor' },
    wsId: 'workspace',
    isMember: true,
    canManageForms: true,
    adminClient: {},
  }),
}));
vi.mock('@/features/forms/schema', () => ({
  formStudioSchema: { safeParse: () => ({ success: true, data: {} }) },
}));
vi.mock('@/features/forms/server', () => ({ saveFormDefinition: state.save }));
beforeEach(() => {
  vi.clearAllMocks();
});
it('returns 404 for a missing or foreign form', async () => {
  state.save.mockRejectedValue(new FormNotFoundError());
  const response = await PUT(
    new NextRequest('http://localhost/api/forms/form', {
      method: 'PUT',
      body: '{}',
    }),
    { params: Promise.resolve({ wsId: 'workspace', formId: 'form' }) }
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Form not found' });
});
it('keeps lookup failures as server errors', async () => {
  state.save.mockRejectedValue(new Error('lookup failed'));
  const response = await PUT(
    new NextRequest('http://localhost/api/forms/form', {
      method: 'PUT',
      body: '{}',
    }),
    { params: Promise.resolve({ wsId: 'workspace', formId: 'form' }) }
  );
  expect(response.status).toBe(500);
});
