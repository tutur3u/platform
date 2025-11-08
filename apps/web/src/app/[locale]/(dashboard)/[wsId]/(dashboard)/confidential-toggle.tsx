'use client';

import { Lock } from '@tuturuuu/icons';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

interface ConfidentialToggleProps {
  hasPermission: boolean;
}

export default function ConfidentialToggle({
  hasPermission,
}: ConfidentialToggleProps) {
  const t = useTranslations('finance-overview');
  const { getSingle, set, remove } = useSearchParams();
  const includeConfidential = getSingle('includeConfidential') !== 'false'; // Default to true

  const handleToggle = (checked: boolean) => {
    if (!hasPermission) return;

    if (checked) {
      // Include confidential (default behavior)
      remove('includeConfidential');
    } else {
      // Exclude confidential
      set({ includeConfidential: 'false' }, false);
    }
  };

  // Don't show toggle if user doesn't have permission
  if (!hasPermission) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-dynamic-orange" />
            <span className="font-medium text-foreground text-sm">
              {t('confidential-mode')}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{t('confidential-mode-tooltip')}</p>
        </TooltipContent>
      </Tooltip>

      <Switch
        id="includeConfidential"
        checked={includeConfidential}
        onCheckedChange={handleToggle}
        className="ml-auto"
      />

      <label
        htmlFor="includeConfidential"
        className="font-medium text-muted-foreground text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {includeConfidential
          ? t('include-confidential')
          : t('exclude-confidential')}
      </label>
    </div>
  );
}
