'use client';
import {
  SatelliteBrand,
  type SatelliteBrandProps,
} from '@tuturuuu/ui/custom/satellite-brand';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export { WorkspaceSelectVisibilityToggle } from '@tuturuuu/ui/custom/satellite-brand';
export type AppBrandId = LaunchableAppSlug | 'infrastructure';
type FixedAppBrandProps = Omit<
  SatelliteBrandProps,
  'appName' | 'logo' | 'LinkComponent'
> & { appId: AppBrandId };
export function FixedAppBrand({ appId, ...props }: FixedAppBrandProps) {
  const t = useTranslations('command_launcher');
  return (
    <SatelliteBrand
      {...props}
      appName={t(`app_names.${appId}`)}
      LinkComponent={Link}
      logo={<TuturuuLogo alt="" className="size-8" height={32} width={32} />}
    />
  );
}
