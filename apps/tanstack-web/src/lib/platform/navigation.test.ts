import { describe, expect, it } from 'vitest';
import {
  isMigrationNotFound,
  isMigrationRedirect,
  MigrationNotFoundError,
  MigrationRedirectError,
  notFound,
  notFoundErrorToResponse,
  redirect,
  redirectErrorToResponse,
} from './navigation';

describe('navigation adapters', () => {
  it('throws typed redirect errors', () => {
    expect(() => redirect('/login', 307)).toThrow(MigrationRedirectError);

    try {
      redirect('/login', 307);
    } catch (error) {
      expect(isMigrationRedirect(error)).toBe(true);
      expect(error).toMatchObject({
        location: '/login',
        status: 307,
      });
    }
  });

  it('throws typed not-found errors', () => {
    expect(() => notFound('Missing workspace')).toThrow(MigrationNotFoundError);

    try {
      notFound('Missing workspace');
    } catch (error) {
      expect(isMigrationNotFound(error)).toBe(true);
      expect(error).toMatchObject({
        message: 'Missing workspace',
        status: 404,
      });
    }
  });

  it('converts navigation errors to responses', async () => {
    const redirectResponse = redirectErrorToResponse(
      new MigrationRedirectError('/login', 303)
    );
    const notFoundResponse = notFoundErrorToResponse(
      new MigrationNotFoundError('Missing')
    );

    expect(redirectResponse.status).toBe(303);
    expect(redirectResponse.headers.get('Location')).toBe('/login');
    expect(notFoundResponse.status).toBe(404);
    await expect(notFoundResponse.text()).resolves.toBe('Missing');
  });
});
