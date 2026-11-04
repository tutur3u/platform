import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import '../style.css';
export const Route = createRootRoute({
  component: Outlet,
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }] }),
  shellComponent: ({ children }: { children: ReactNode }) => <html><head><HeadContent /></head><body>{children}<Scripts /></body></html>,
});
