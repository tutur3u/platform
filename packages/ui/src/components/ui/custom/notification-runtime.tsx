'use client';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createContext,
  useContext,
} from 'react';
export interface NotificationRuntimeValue {
  params: { wsId?: string | string[]; locale?: string | string[] };
  pathname: string;
  router: { push: (url: string) => void; refresh: () => void };
  Link: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >;
  realtime: boolean;
  /**
   * Notification API transport. Omitted means the page's own origin, which
   * every host proxies to the owning notification routes.
   */
  apiOptions?: InternalApiClientOptions;
}
export const NotificationRuntime =
  createContext<NotificationRuntimeValue | null>(null);
export function useNotificationRuntime() {
  const value = useContext(NotificationRuntime);
  if (!value) throw new Error('NotificationRuntime is required');
  return value;
}
