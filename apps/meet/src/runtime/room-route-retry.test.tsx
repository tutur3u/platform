// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import { RoomRouteError } from './room-route-feedback';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('retries a failed room loader and reaches the room once it recovers', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  let attempts = 0;
  const root = createRootRoute();
  const room = createRoute({
    getParentRoute: () => root,
    path: '/r/$code',
    loader: async () => {
      attempts++;
      if (attempts === 1) throw new Error('fixture outage');
      return 'Room recovered';
    },
    component: () => <h1>Room recovered</h1>,
    errorComponent: ({ reset }) => (
      <RoomRouteError pathname="/r/test" reset={reset} />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([room]),
    history: createMemoryHistory({ initialEntries: ['/r/test'] }),
    defaultPendingMinMs: 0,
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<RouterProvider router={router} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: en.meet.call.connection_refresh,
      })
    );
    expect(
      await screen.findByRole('heading', { name: 'Room recovered' })
    ).toBeTruthy();
    expect(attempts).toBe(2);
  } finally {
    error.mockRestore();
  }
});
