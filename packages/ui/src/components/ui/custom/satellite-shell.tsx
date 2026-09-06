'use client';

import type { ComponentProps } from 'react';
import {
  SatelliteBrand,
  type SatelliteBrandProps,
  ShellAnchor,
} from './satellite-brand';
import { Structure } from './structure';

export interface SatelliteShellProps
  extends Omit<
    ComponentProps<typeof Structure>,
    'sidebarHeader' | 'mobileHeader'
  > {
  brand: SatelliteBrandProps;
  homeLabel: string;
  collapsedLogo?: SatelliteBrandProps['logo'];
  mobileBrandActions?: SatelliteBrandProps['actions'];
}

/** Actual satellite chrome. Framework adapters supply routing, auth and workspace services. */
export function SatelliteShell({
  brand,
  homeLabel,
  collapsedLogo,
  mobileBrandActions,
  ...props
}: SatelliteShellProps) {
  const Link = brand.LinkComponent ?? ShellAnchor;
  return (
    <Structure
      {...props}
      sidebarHeader={
        props.isCollapsed ? (
          <Link
            aria-label={homeLabel}
            className="flex flex-none items-center justify-center"
            href={brand.centralHref}
          >
            {collapsedLogo ?? brand.logo}
          </Link>
        ) : (
          <SatelliteBrand {...brand} />
        )
      }
      mobileHeader={<SatelliteBrand {...brand} actions={mobileBrandActions} />}
    />
  );
}
