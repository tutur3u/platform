import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { routeTree } from './routeTree.gen';

function matched(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const matches = router.matchRoutes(path);
  const leaf = matches.at(-1);
  return { id: leaf?.routeId, params: leaf?.params as { locale?: string } };
}

test.each([
  ['/', '/{-$locale}/', undefined],
  ['/ship', '/{-$locale}/ship', undefined],
  ['/projects', '/{-$locale}/projects', undefined],
  ['/fleet-access', '/{-$locale}/fleet-access', undefined],
  ['/vi', '/{-$locale}/', 'vi'],
  ['/vi/ship', '/{-$locale}/ship', 'vi'],
  ['/vi/fleet-access', '/{-$locale}/fleet-access', 'vi'],
])('English has no prefix and Vietnamese keeps /vi: %s', (path, id, locale) => {
  const leaf = matched(path);
  expect(leaf.id).toBe(id);
  expect(leaf.params.locale).toBe(locale);
});
