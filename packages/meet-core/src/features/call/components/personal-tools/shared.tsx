'use client';

import { ExternalLink, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  getLaunchableApp,
  type LaunchableAppSlug,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import type { PersonalToolsSnapshot } from '../../lib/personal-tools';

export type PersonalAppSlug = Extract<
  LaunchableAppSlug,
  'tasks' | 'calendar' | 'meet' | 'chat' | 'drive'
>;

export function resolveSafePersonalAppUrl(
  slug: PersonalAppSlug,
  workspace: PersonalToolsSnapshot['workspace'] | null | undefined,
  path?: string | null,
  resolveUrl = resolveLaunchableAppUrl
): string | null {
  const app = getLaunchableApp(slug);
  if (!app) return null;
  try {
    const resolved = resolveUrl({
      app,
      workspace,
      path,
    });
    const parsed = new URL(resolved);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function PersonalAppLinkButton({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) return null;
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="mb-3 h-8 gap-1.5 rounded-full px-3.5"
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" />
        {label}
      </a>
    </Button>
  );
}

export function PersonalSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-3">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}
