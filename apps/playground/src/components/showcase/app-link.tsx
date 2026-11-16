import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import type { AnchorHTMLAttributes } from 'react';

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** App-relative path such as `/demo/tasks` or `/#products`. */
  href: string;
};

/**
 * Full-document link to a showcase page, prefixed with the mount base
 * (`/playground` on tuturuuu.com, nothing on the root host). Plain anchors
 * keep navigation free of client router loads, so every page renders from
 * one document request and the demos stay browser-only.
 */
export function AppLink({ href, ...props }: AppLinkProps) {
  return <a {...props} href={withAppBase(href)} />;
}
