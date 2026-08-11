import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type AnyRedirect, isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route as WorkspaceUsersSplatRoute } from './$locale/$wsId/users/$';
import { Route as WorkspaceUsersIndexRoute } from './$locale/$wsId/users/index';

const usersRouteDirectory = fileURLToPath(
  new URL('./$locale/$wsId/users/', import.meta.url)
);

async function listRouteFiles(
  directory: string,
  prefix = ''
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      return entry.isDirectory()
        ? listRouteFiles(`${directory}/${entry.name}`, relativePath)
        : [relativePath];
    })
  );

  return files.flat().toSorted();
}

type RedirectLoader = (context: never) => unknown;

async function captureRedirect(loader: RedirectLoader, context: never) {
  try {
    await loader(context);
  } catch (error) {
    if (isRedirect(error)) return error;
    throw error;
  }

  throw new Error('Expected route loader to throw a redirect.');
}

function expectContactsRedirect(response: AnyRedirect, expectedHref: string) {
  expect(response.status).toBe(307);
  expect(response.options.href).toBe(expectedHref);
  expect(response.headers.get('location')).toBe(expectedHref);
}

describe('workspace-user Contacts route ownership', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps only the root and descendant redirect boundaries', async () => {
    await expect(listRouteFiles(usersRouteDirectory)).resolves.toEqual([
      '$.tsx',
      'index.tsx',
    ]);
  });

  it('redirects the workspace-user root without rendering CRM code', async () => {
    vi.stubEnv('CONTACTS_APP_URL', 'https://contacts.example.com');
    const loader = WorkspaceUsersIndexRoute.options.loader;
    expect(loader).toBeTypeOf('function');

    const response = await captureRedirect(
      loader as RedirectLoader,
      {
        location: {
          search: { empty: '', page: 2, tag: ['one', 'two'] },
        },
        params: { locale: 'en', wsId: 'workspace / one' },
      } as never
    );

    expectContactsRedirect(
      response,
      'https://contacts.example.com/workspace%20%2F%20one/users?empty=&page=2&tag=one&tag=two'
    );
  });

  it('redirects nested user paths and preserves their suffix and query', async () => {
    vi.stubEnv('CONTACTS_APP_URL', 'https://contacts.example.com');
    const loader = WorkspaceUsersSplatRoute.options.loader;
    expect(loader).toBeTypeOf('function');

    const response = await captureRedirect(
      loader as RedirectLoader,
      {
        location: { search: { tab: 'members' } },
        params: {
          _splat: 'groups/nhóm học viên/schedule',
          locale: 'vi',
          wsId: 'ws-1',
        },
      } as never
    );

    expectContactsRedirect(
      response,
      'https://contacts.example.com/ws-1/users/groups/nh%C3%B3m%20h%E1%BB%8Dc%20vi%C3%AAn/schedule?tab=members'
    );
  });
});
