import { Monitor } from '@tuturuuu/icons';
import { Globe, Smartphone } from '@tuturuuu/icons/lucide-static';
import type { DownloadPlatform } from '@/lib/download-platform';

export function PlatformIcon({
  platform,
  className,
}: {
  platform: DownloadPlatform;
  className?: string;
}) {
  const Icon =
    platform === 'web'
      ? Globe
      : platform === 'ios' || platform === 'android'
        ? Smartphone
        : Monitor;
  return <Icon className={className} aria-hidden="true" />;
}
