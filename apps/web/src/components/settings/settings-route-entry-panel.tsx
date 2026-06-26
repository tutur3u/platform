'use client';

import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface SettingsRouteEntryPanelProps {
  href: string;
}

export function SettingsRouteEntryPanel({
  href,
}: SettingsRouteEntryPanelProps) {
  const t = useTranslations();

  return (
    <div className="flex justify-start">
      <Button asChild>
        <Link href={href}>
          {t('command_launcher.open')}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
